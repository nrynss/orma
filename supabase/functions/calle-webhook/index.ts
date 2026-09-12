/**
 * T2.6 CALL-E webhook receiver.
 *
 * CALL-E does not sign webhook requests. The path secret is the first gate.
 * The envelope only selects an authoritative GET /v1/calls/{id}. No call,
 * item, result, or billing state is ever taken from the webhook body.
 */

const EVENT_ID_HEADER = "call-e-event-id";
const MAX_BODY_BYTES = 128 * 1024;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]+$/;
const CALL_ID_PATTERN = /^call_[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_EVENT_TYPES = new Set([
  "call.completed",
  "call.failed",
  "call.result_validation_failed",
]);

const PENDING = "pending";
const REFRESHING = "refreshing";
const REFETCHED = "refetched";
const IGNORED = "ignored";

export type WebhookDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  webhookSecret: string;
  calleApiBase: string;
  calleApiKey: string;
  fetch: typeof fetch;
};

type WebhookEnvelope = {
  id: string;
  type: "call.completed" | "call.failed" | "call.result_validation_failed";
  created_at: string;
  data: { id: string };
};

type AuthoritativeCall = {
  id: string;
  metadata: { call_run_id: string };
};

export function requireNamedEnv(
  name: string,
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
): string {
  const value = getEnv(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export function webhookUrl(apiUrl: string, secret: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/functions/v1/calle-webhook/${secret}`;
}

export function presentedWebhookSecret(pathname: string): string | null {
  const marker = "/calle-webhook/";
  const index = pathname.indexOf(marker);
  if (index === -1) return null;
  const secret = pathname.slice(index + marker.length).replace(/\/+$/, "");
  return secret || null;
}

export function webhookSecretsMatch(presented: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(presented);
  const right = encoder.encode(expected);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left[index] ^ right[index];
  return diff === 0;
}

function restUrl(apiUrl: string, path: string, query = ""): string {
  return `${apiUrl.replace(/\/+$/, "")}/rest/v1/${path}${query ? `?${query}` : ""}`;
}

function serviceHeaders(key: string, prefer?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  if (prefer) headers.prefer = prefer;
  return headers;
}

export function parseWebhookEnvelope(body: string, headerEventId: string): WebhookEnvelope | null {
  if (!EVENT_ID_PATTERN.test(headerEventId)) return null;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Partial<WebhookEnvelope>;
  if (
    envelope.id !== headerEventId ||
    typeof envelope.id !== "string" ||
    typeof envelope.type !== "string" ||
    !TERMINAL_EVENT_TYPES.has(envelope.type) ||
    typeof envelope.created_at !== "string" ||
    Number.isNaN(Date.parse(envelope.created_at)) ||
    !envelope.data ||
    typeof envelope.data !== "object" ||
    typeof envelope.data.id !== "string" ||
    !CALL_ID_PATTERN.test(envelope.data.id)
  ) return null;
  return envelope as WebhookEnvelope;
}

function parseAuthoritativeCall(value: unknown, expectedCallId: string): AuthoritativeCall | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const call = value as Partial<AuthoritativeCall>;
  if (
    call.id !== expectedCallId ||
    !call.metadata ||
    typeof call.metadata !== "object" ||
    typeof call.metadata.call_run_id !== "string" ||
    !UUID_PATTERN.test(call.metadata.call_run_id)
  ) return null;
  return call as AuthoritativeCall;
}

export function depsFromEnv(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
  fetchImpl: typeof fetch = fetch,
): WebhookDeps {
  return {
    apiUrl: requireNamedEnv("ORMA_API_URL", getEnv),
    serviceRoleKey: requireNamedEnv("SUPABASE_SERVICE_ROLE_KEY", getEnv),
    webhookSecret: requireNamedEnv("ORMA_WEBHOOK_SECRET", getEnv),
    calleApiBase: requireNamedEnv("CALLE_API_BASE", getEnv),
    calleApiKey: requireNamedEnv("CALLE_API_KEY", getEnv),
    fetch: fetchImpl,
  };
}

async function insertPendingEvent(deps: WebhookDeps, eventId: string): Promise<void> {
  const response = await deps.fetch(restUrl(deps.apiUrl, "webhook_events"), {
    method: "POST",
    headers: serviceHeaders(deps.serviceRoleKey, "return=minimal"),
    body: JSON.stringify({ event_id: eventId, type: PENDING }),
  });
  if (response.status !== 409 && !response.ok) throw new Error("webhook event record failed");
}

async function claimPendingEvent(deps: WebhookDeps, eventId: string): Promise<boolean> {
  const query = new URLSearchParams({ event_id: `eq.${eventId}`, type: `eq.${PENDING}` });
  const response = await deps.fetch(restUrl(deps.apiUrl, "webhook_events", query.toString()), {
    method: "PATCH",
    headers: serviceHeaders(deps.serviceRoleKey, "return=representation"),
    body: JSON.stringify({ type: REFRESHING }),
  });
  if (!response.ok) throw new Error("webhook event claim failed");
  const rows: unknown = await response.json();
  return Array.isArray(rows) && rows.length === 1;
}

async function setEventState(deps: WebhookDeps, eventId: string, type: string): Promise<void> {
  const query = new URLSearchParams({ event_id: `eq.${eventId}`, type: `eq.${REFRESHING}` });
  const response = await deps.fetch(restUrl(deps.apiUrl, "webhook_events", query.toString()), {
    method: "PATCH",
    headers: serviceHeaders(deps.serviceRoleKey, "return=minimal"),
    body: JSON.stringify({ type }),
  });
  if (!response.ok) throw new Error("webhook event state update failed");
}

async function fetchAuthoritativeCall(deps: WebhookDeps, callId: string): Promise<AuthoritativeCall | null> {
  const response = await deps.fetch(
    `${deps.calleApiBase.replace(/\/+$/, "")}/v1/calls/${encodeURIComponent(callId)}`,
    { headers: { authorization: `Bearer ${deps.calleApiKey}` } },
  );
  if (!response.ok) throw new Error(`CALL-E re-fetch returned HTTP ${response.status}`);
  return parseAuthoritativeCall(await response.json(), callId);
}

async function hasMatchingOrmaRun(deps: WebhookDeps, call: AuthoritativeCall): Promise<boolean> {
  const query = new URLSearchParams({
    select: "id",
    id: `eq.${call.metadata.call_run_id}`,
    calle_call_id: `eq.${call.id}`,
    limit: "1",
  });
  const response = await deps.fetch(restUrl(deps.apiUrl, "call_runs", query.toString()), {
    headers: serviceHeaders(deps.serviceRoleKey),
  });
  if (!response.ok) throw new Error("call run ownership check failed");
  const rows: unknown = await response.json();
  return Array.isArray(rows) && rows.length === 1;
}

export function createWebhookHandler(deps: WebhookDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    const presented = presentedWebhookSecret(new URL(request.url).pathname);
    if (!presented || !webhookSecretsMatch(presented, deps.webhookSecret)) {
      return new Response(null, { status: 401 });
    }
    const headerEventId = request.headers.get(EVENT_ID_HEADER);
    if (!headerEventId) return new Response(null, { status: 400 });
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
        return new Response(null, { status: 413 });
      }
      const envelope = parseWebhookEnvelope(body, headerEventId);
      if (!envelope) return new Response(null, { status: 400 });
      await insertPendingEvent(deps, envelope.id);
      if (!await claimPendingEvent(deps, envelope.id)) return new Response(null, { status: 200 });
      try {
        const call = await fetchAuthoritativeCall(deps, envelope.data.id);
        if (!call || !await hasMatchingOrmaRun(deps, call)) {
          await setEventState(deps, envelope.id, IGNORED);
          return new Response(null, { status: 200 });
        }
        await setEventState(deps, envelope.id, REFETCHED);
        return new Response(null, { status: 200 });
      } catch (error) {
        try {
          await setEventState(deps, envelope.id, PENDING);
        } catch (releaseError) {
          console.error("calle webhook event release failed", releaseError instanceof Error ? releaseError.message : "unknown error");
        }
        throw error;
      }
    } catch (error) {
      console.error("calle webhook re-fetch failed", error instanceof Error ? error.message : "unknown error");
      return new Response(null, { status: 500 });
    }
  };
}

if (import.meta.main) Deno.serve(createWebhookHandler(depsFromEnv()));

const testFn = (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void }).test;
if (typeof testFn === "function" && !import.meta.main) {
  const event = (id = "evt_terminal"): Record<string, unknown> => ({
    id, type: "call.completed", created_at: "2026-09-13T12:00:00.000Z", data: { id: "call_terminal" },
  });
  const baseDeps = (fetchImpl: typeof fetch): WebhookDeps => ({
    apiUrl: "https://orma-api.nryn.dev", serviceRoleKey: "service-key",
    webhookSecret: "path-secret", calleApiBase: "https://api.call-e.test",
    calleApiKey: "calle-key", fetch: fetchImpl,
  });
  const request = (body: unknown = event(), eventId = "evt_terminal") => new Request(
    "https://orma-api.nryn.dev/functions/v1/calle-webhook/path-secret",
    { method: "POST", headers: { [EVENT_ID_HEADER]: eventId }, body: JSON.stringify(body) },
  );

  testFn("rejects a request without the path secret before reading its body", async () => {
    const handler = createWebhookHandler(baseDeps(async () => { throw new Error("fetch must not be called"); }));
    const response = await handler(new Request("https://orma-api.nryn.dev/functions/v1/calle-webhook/wrong", {
      method: "POST", headers: { [EVENT_ID_HEADER]: "evt_terminal" }, body: "not json",
    }));
    if (response.status !== 401) throw new Error("missing secret must be rejected");
  });

  testFn("rejects an envelope whose header id differs from its body id", async () => {
    const handler = createWebhookHandler(baseDeps(async () => { throw new Error("invalid envelope reached a dependency"); }));
    const response = await handler(request(event("evt_other")));
    if (response.status !== 400) throw new Error("header and body ids must match");
  });

  testFn("accepts each documentation-derived terminal contract fixture", async () => {
    const fixtures = [
      "webhook-call-completed.documented.json",
      "webhook-call-failed.documented.json",
      "webhook-result-validation-failed.documented.json",
    ];
    for (const fixture of fixtures) {
      const raw = await Deno.readTextFile(new URL(`../../../testdata/calle/${fixture}`, import.meta.url));
      const value = JSON.parse(raw) as { headers: { "call-e-event-id": string }; body: unknown };
      if (!parseWebhookEnvelope(JSON.stringify(value.body), value.headers["call-e-event-id"])) {
        throw new Error(`documented fixture ${fixture} did not match the receiver contract`);
      }
    }
  });

  testFn("re-fetches the documented terminal envelope and never uses body metadata", async () => {
    const requests: Request[] = [];
    const handler = createWebhookHandler(baseDeps(async (input, init) => {
      const current = new Request(input, init);
      requests.push(current);
      if (current.url.endsWith("/webhook_events") && current.method === "POST") return new Response(null, { status: 201 });
      if (current.url.includes("/webhook_events?") && current.method === "PATCH") return Response.json([{ event_id: "evt_terminal" }]);
      if (current.url.endsWith("/v1/calls/call_terminal")) {
        if (current.headers.get("authorization") !== "Bearer calle-key") throw new Error("CALL-E key missing");
        return Response.json({ id: "call_terminal", metadata: { call_run_id: "11111111-1111-4111-8111-111111111111" } });
      }
      if (current.url.includes("/call_runs?")) return Response.json([{ id: "11111111-1111-4111-8111-111111111111" }]);
      throw new Error(`unexpected request ${current.method} ${current.url}`);
    }));
    const body = { ...event(), data: { id: "call_terminal", call_run_id: "99999999-9999-4999-8999-999999999999" } };
    const response = await handler(request(body));
    if (response.status !== 200) throw new Error("valid notification must be acknowledged");
    const local = requests.find((current) => current.url.includes("/call_runs?"));
    if (!local || local.url.includes("99999999-9999-4999-8999-999999999999")) {
      throw new Error("untrusted body metadata selected a call run");
    }
    if (!local.url.includes("calle_call_id=eq.call_terminal")) throw new Error("local run must match fetched call");
  });

  testFn("a duplicate terminal event is a no-op and does not re-fetch", async () => {
    const handler = createWebhookHandler(baseDeps(async (input, init) => {
      const current = new Request(input, init);
      if (current.method === "POST") return new Response(null, { status: 409 });
      if (current.url.includes("/webhook_events?") && current.method === "PATCH") return Response.json([]);
      throw new Error("duplicate reached CALL-E or call_runs");
    }));
    const response = await handler(request());
    if (response.status !== 200) throw new Error("duplicate must be acknowledged");
  });

  testFn("a re-fetch failure releases the event so a retry can win", async () => {
    let callFetches = 0;
    let pending = true;
    const handler = createWebhookHandler(baseDeps(async (input, init) => {
      const current = new Request(input, init);
      if (current.method === "POST") return new Response(null, { status: callFetches === 0 ? 201 : 409 });
      if (current.url.includes("/webhook_events?") && current.method === "PATCH") {
        const payload = JSON.parse(await current.text()) as { type: string };
        if (payload.type === REFRESHING && pending) { pending = false; return Response.json([{ event_id: "evt_terminal" }]); }
        if (payload.type === PENDING) { pending = true; return new Response(null, { status: 204 }); }
        if (payload.type === REFETCHED) return new Response(null, { status: 204 });
        return Response.json([]);
      }
      if (current.url.endsWith("/v1/calls/call_terminal")) {
        callFetches++;
        if (callFetches === 1) return new Response(null, { status: 503 });
        return Response.json({ id: "call_terminal", metadata: { call_run_id: "11111111-1111-4111-8111-111111111111" } });
      }
      if (current.url.includes("/call_runs?")) return Response.json([{ id: "11111111-1111-4111-8111-111111111111" }]);
      throw new Error(`unexpected request ${current.method} ${current.url}`);
    }));
    if ((await handler(request())).status !== 500) throw new Error("failed re-fetch must request a retry");
    if ((await handler(request())).status !== 200 || callFetches !== 2) throw new Error("retry must re-fetch after recovery");
  });
}
