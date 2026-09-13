/**
 * T2.4 CALL-E dispatch.
 *
 * This module is deliberately the only place that can issue POST /v1/calls.
 * The caller supplies a run already claimed by PostgreSQL. The durable key is
 * forwarded unchanged so a network retry cannot place a second call.
 */

import { assembleBriefing, renderCallTask, storeBriefing } from "./briefing.ts";
import { dryRunFixture, executeDryRun, isDryRun } from "./dispatch-mode.ts";
import { recordCallEvent } from "./events.ts";
import type { CallStatus, CallTaskFixture } from "./fixtures.ts";
import { loadCallFixtures } from "./fixtures.ts";
import { ingestTerminalRun } from "./ingest.ts";

const POLL_DELAY_MS = 60_000;

export type ClaimedRun = {
  id: string;
  user_id: string;
  idempotency_key: string;
  state: string;
  slot_id: string | null;
  dry_run: boolean;
};

type DispatchProfile = {
  id: string;
  phone_e164: string | null;
  phone_confirmed_at: string | null;
};

type Consent = { id: string };
type Slot = { local_time: string };

export type CalleDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  calleApiBase: string;
  calleApiKey: string;
  webhookUrl: string;
  fetch: typeof fetch;
  now: () => Date;
  /** Read only for the dry-mode decision, which fails closed when unset. */
  getEnv?: (name: string) => string | undefined;
};

export type CalleCallRequest = {
  task: string;
  recipients: Array<{ phones: string[] }>;
  result_schema: Record<string, unknown>;
  webhook_url: string;
  metadata: { call_run_id: string };
};

/** The reviewed inline schema from docs/calle-call.md. */
export const CALL_E_RESULT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["captured_items", "retired_items"],
  properties: {
    captured_items: {
      type: "array",
      description: "New things the caller said they need to track. Empty array if none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidence_offset_seconds"],
        properties: {
          text: { type: "string", description: "The item in the caller's own words, one short line." },
          evidence_offset_seconds: { type: "integer", description: "Transcript offset in seconds where the caller said it." },
        },
      },
    },
    retired_items: {
      type: "array",
      description: "Items the caller asked to drop. Evidence is required because retiring is destructive. Empty array if none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item_id", "evidence_offset_seconds"],
        properties: {
          item_id: { type: "string", description: "The id given in the task for that item." },
          evidence_offset_seconds: { type: "integer", description: "Transcript offset in seconds where the caller asked to drop it." },
        },
      },
    },
    commitments: {
      type: "array",
      description: "Things the caller said out loud they would do, with a time attached where they gave one.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item_id", "evidence_offset_seconds"],
        properties: {
          item_id: { type: "string", description: "The id given in the task for that item." },
          due: { type: "string", description: "When they said they would do it, in their own words. Omit if they gave no time." },
          evidence_offset_seconds: { type: "integer", description: "Transcript offset in seconds where they committed." },
        },
      },
    },
    slot_change_requested: {
      type: "string",
      enum: ["yes", "no", "unknown"],
      description: "Use yes only if the caller asked for a different call time. Use unknown if it was ambiguous.",
    },
    slot_change_time: {
      type: "string",
      description: "The time they asked for, in their own words. Omit unless slot_change_requested is yes.",
    },
    mood: {
      type: "string",
      enum: ["ok", "low", "stressed", "energised", "unknown"],
      description: "How the caller sounded overall. Use unknown when the call was too short or too flat to tell.",
    },
  },
};

function requireNamedEnv(name: string, getEnv: (key: string) => string | undefined): string {
  const value = getEnv(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export function depsFromEnv(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
  fetchImpl: typeof fetch = fetch,
): CalleDeps {
  const apiUrl = requireNamedEnv("ORMA_API_URL", getEnv);
  const webhookSecret = requireNamedEnv("ORMA_WEBHOOK_SECRET", getEnv);
  return {
    apiUrl,
    serviceRoleKey: requireNamedEnv("SUPABASE_SERVICE_ROLE_KEY", getEnv),
    calleApiBase: requireNamedEnv("CALLE_API_BASE", getEnv),
    calleApiKey: requireNamedEnv("CALLE_API_KEY", getEnv),
    webhookUrl: `${apiUrl.replace(/\/+$/, "")}/functions/v1/calle-webhook/${webhookSecret}`,
    fetch: fetchImpl,
    now: () => new Date(),
    getEnv,
  };
}

function restUrl(base: string, path: string, query = ""): string {
  return `${base.replace(/\/+$/, "")}/rest/v1/${path}${query ? `?${query}` : ""}`;
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

async function readOne<T>(deps: CalleDeps, table: string, query: URLSearchParams): Promise<T | null> {
  const response = await deps.fetch(restUrl(deps.apiUrl, table, query.toString()), {
    headers: serviceHeaders(deps.serviceRoleKey),
  });
  if (!response.ok) throw new Error(`${table} read failed`);
  const rows = await response.json() as T[];
  return rows[0] ?? null;
}

async function updateRun(
  deps: CalleDeps,
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const response = await deps.fetch(
    restUrl(deps.apiUrl, "call_runs", new URLSearchParams({ id: `eq.${runId}` }).toString()),
    {
      method: "PATCH",
      headers: serviceHeaders(deps.serviceRoleKey, "return=minimal"),
      body: JSON.stringify(patch),
    },
  );
  if (!response.ok) throw new Error("call_runs dispatch update failed");
}

function failure(code: string, message: string): Record<string, string> {
  return { failure_code: code, failure_message: message };
}

async function refuseRun(deps: CalleDeps, runId: string, reason: string): Promise<void> {
  await updateRun(deps, runId, {
    state: "canceled",
    disposition: "canceled",
    completed_at: deps.now().toISOString(),
    calle_failure: failure("dispatch_refused", reason),
  });
}

export function buildCallRequest(
  callRunId: string,
  phoneE164: string,
  task: string,
  webhookUrl: string,
): CalleCallRequest {
  return {
    task,
    recipients: [{ phones: [phoneE164] }],
    result_schema: CALL_E_RESULT_SCHEMA,
    webhook_url: webhookUrl,
    metadata: { call_run_id: callRunId },
  };
}

function asCallTask(value: unknown): CallTaskFixture {
  if (typeof value !== "object" || value === null) throw new Error("CALL-E returned no call task");
  const call = value as Partial<CallTaskFixture>;
  if (typeof call.id !== "string" || typeof call.status !== "string") {
    throw new Error("CALL-E response missing id or status");
  }
  return call as CallTaskFixture;
}

function acceptedState(status: CallStatus): "dispatched" | "awaiting_result" {
  return status === "queued" || status === "in_progress" ? "dispatched" : "awaiting_result";
}

/**
 * Dispatches one claimed run. A missing or revoked consent is terminally
 * canceled before any CALL-E request. A 409 is terminally visible and is never
 * retried with a different key.
 */
export async function dispatchClaimedRun(run: ClaimedRun, deps: CalleDeps): Promise<void> {
  if (run.state !== "claimed") throw new Error("only claimed runs may dispatch");

  const profile = await readOne<DispatchProfile>(
    deps,
    "profiles",
    new URLSearchParams({ select: "id,phone_e164,phone_confirmed_at", id: `eq.${run.user_id}` }),
  );
  if (!profile?.phone_e164 || !profile.phone_confirmed_at) {
    await refuseRun(deps, run.id, "profile has no confirmed E.164 number");
    return;
  }

  const consent = await readOne<Consent>(
    deps,
    "consents",
    new URLSearchParams({ select: "id", user_id: `eq.${run.user_id}`, kind: "eq.outbound_calls", revoked_at: "is.null", limit: "1" }),
  );
  if (!consent) {
    await refuseRun(deps, run.id, "profile has no live outbound_calls consent");
    return;
  }

  if (!run.slot_id) {
    await refuseRun(deps, run.id, "call run has no source slot");
    return;
  }
  const slot = await readOne<Slot>(
    deps,
    "slots",
    new URLSearchParams({ select: "local_time", id: `eq.${run.slot_id}` }),
  );
  if (!slot?.local_time) {
    await refuseRun(deps, run.id, "call run source slot no longer exists");
    return;
  }

  const briefing = await assembleBriefing(
    { userId: run.user_id, slotLocalTime: slot.local_time },
    { apiUrl: deps.apiUrl, serviceRoleKey: deps.serviceRoleKey, fetch: deps.fetch },
  );
  await storeBriefing(run.id, briefing, {
    apiUrl: deps.apiUrl,
    serviceRoleKey: deps.serviceRoleKey,
    fetch: deps.fetch,
  });
  const body = buildCallRequest(run.id, profile.phone_e164, renderCallTask(briefing), deps.webhookUrl);
  const requestBody = JSON.stringify(body);

  // Dry mode is decided here, ahead of anything that can reach the network, and
  // it reuses the serialized body the live path would send. A run is dry when
  // the run says so, or when ORMA_DRY_RUN is unset or true.
  if (isDryRun(run.dry_run, deps.getEnv)) {
    await executeDryRun(run.id, run.user_id, requestBody, dryRunFixture(), {
      recordEvent: async (event) => {
        await recordCallEvent(event.callRunId, event.kind, event.detail, deps);
      },
      updateRun: (callRunId, patch) => updateRun(deps, callRunId, patch),
      ingest: (source) =>
        ingestTerminalRun(source, {
          apiUrl: deps.apiUrl,
          serviceRoleKey: deps.serviceRoleKey,
          fetch: deps.fetch,
        }),
      now: deps.now,
    });
    return;
  }

  const response = await deps.fetch(`${deps.calleApiBase.replace(/\/+$/, "")}/v1/calls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${deps.calleApiKey}`,
      "content-type": "application/json",
      "idempotency-key": run.idempotency_key,
    },
    body: requestBody,
  });
  if (response.status === 409) {
    await updateRun(deps, run.id, {
      state: "failed",
      calle_failure: failure("idempotency_conflict", "CALL-E rejected this idempotency key with different inputs"),
      completed_at: deps.now().toISOString(),
    });
    throw new Error("CALL-E idempotency conflict");
  }
  if (!response.ok) {
    await updateRun(deps, run.id, {
      state: "failed",
      calle_failure: failure("dispatch_failed", `CALL-E dispatch returned HTTP ${response.status}`),
      completed_at: deps.now().toISOString(),
    });
    throw new Error("CALL-E dispatch failed");
  }

  const call = asCallTask(await response.json());
  const now = deps.now();
  await updateRun(deps, run.id, {
    state: acceptedState(call.status),
    calle_call_id: call.id,
    calle_confidence: call.completion_confidence,
    calle_failure: call.failure_code ? failure(call.failure_code, call.failure_message ?? "") : null,
    dispatched_at: now.toISOString(),
    poll_after: new Date(now.getTime() + POLL_DELAY_MS).toISOString(),
  });
  await recordCallEvent(
    run.id,
    "dispatched",
    { calle_call_id: call.id, state: acceptedState(call.status) },
    deps,
  );
}

const testFn = (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void }).test;
if (typeof testFn === "function") {
  const run: ClaimedRun = {
    id: "run-1", user_id: "user-1", idempotency_key: "orma:user-1:2026-09-12:morning:v1",
    state: "claimed", slot_id: "slot-1", dry_run: false,
  };
  // Live dispatch is the explicit opt-in, so every live test says so.
  const baseDeps = (fetchImpl: typeof fetch): CalleDeps => ({
    apiUrl: "https://orma-api.nryn.dev", serviceRoleKey: "service-key",
    calleApiBase: "https://api.call-e.test", calleApiKey: "calle-key",
    webhookUrl: "https://orma-api.nryn.dev/functions/v1/calle-webhook/secret",
    fetch: fetchImpl, now: () => new Date("2026-09-12T00:00:00.000Z"),
    getEnv: () => "false",
  });
  const stubFetch = (requests: Request[]): typeof fetch => async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.includes("/profiles")) return Response.json([{ id: "user-1", phone_e164: "+919999999999", phone_confirmed_at: "2026-09-01T00:00:00Z" }]);
    if (request.url.includes("/consents")) return Response.json([{ id: "consent-1" }]);
    if (request.url.includes("/slots")) return Response.json([{ local_time: "08:00" }]);
    if (request.url.includes("assemble_briefing")) return Response.json({ user_name: "Narayan", open_count: 0, lead_line: "Nothing urgent today.", open_items: "Nothing open.", last_call_summary: "", slot_local_time: "08:00" });
    if (request.url.includes("ingest_call_result")) return Response.json({ already_ingested: false, disposition: "answered_extracted", counts: { items: 1, mentions: 1, retirements: 0, commitments: 0 }, slot_change_requested: null });
    if (request.url.endsWith("/v1/calls")) return Response.json({ id: "call-1", status: "queued", completion_confidence: null });
    return new Response(null, { status: 204 });
  };

  testFn("dispatch sends the durable key and records the returned CALL-E id", async () => {
    const requests: Request[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/profiles")) return Response.json([{ id: "user-1", phone_e164: "+919999999999", phone_confirmed_at: "2026-09-01T00:00:00Z" }]);
      if (request.url.includes("/consents")) return Response.json([{ id: "consent-1" }]);
      if (request.url.includes("/slots")) return Response.json([{ local_time: "08:00" }]);
      if (request.url.includes("assemble_briefing")) return Response.json({ user_name: "Narayan", open_count: 0, lead_line: "Nothing urgent today.", open_items: "Nothing open.", last_call_summary: "", slot_local_time: "08:00" });
      if (request.url.endsWith("/v1/calls")) return Response.json({ id: "call-1", status: "queued", completion_confidence: null });
      return new Response(null, { status: 204 });
    };
    await dispatchClaimedRun(run, baseDeps(fetchStub));
    const callRequest = requests.find((request) => request.url.endsWith("/v1/calls"));
    if (!callRequest || callRequest.headers.get("idempotency-key") !== run.idempotency_key) throw new Error("durable idempotency key was not forwarded");
    const requestBody = await callRequest.json() as CalleCallRequest;
    if (requestBody.metadata.call_run_id !== run.id || requestBody.recipients[0].phones[0] !== "+919999999999") throw new Error("CALL-E request shape is incomplete");
    const finalPatch = requests.filter((request) => request.method === "PATCH").at(-1);
    if (!finalPatch || !(await finalPatch.text()).includes('"calle_call_id":"call-1"')) throw new Error("returned call id was not stored");
  });

  testFn("missing consent is recorded and never reaches CALL-E", async () => {
    const requests: Request[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/profiles")) return Response.json([{ id: "user-1", phone_e164: "+919999999999", phone_confirmed_at: "2026-09-01T00:00:00Z" }]);
      if (request.url.includes("/consents")) return Response.json([]);
      return new Response(null, { status: 204 });
    };
    await dispatchClaimedRun(run, baseDeps(fetchStub));
    if (requests.some((request) => request.url.endsWith("/v1/calls"))) throw new Error("dispatch called CALL-E without consent");
    const patch = requests.find((request) => request.method === "PATCH");
    if (!patch || !(await patch.text()).includes("dispatch_refused")) throw new Error("consent refusal was not recorded");
  });

  testFn("a CALL-E 409 is visible and does not retry with a fresh key", async () => {
    const requests: Request[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/profiles")) return Response.json([{ id: "user-1", phone_e164: "+919999999999", phone_confirmed_at: "2026-09-01T00:00:00Z" }]);
      if (request.url.includes("/consents")) return Response.json([{ id: "consent-1" }]);
      if (request.url.includes("/slots")) return Response.json([{ local_time: "08:00" }]);
      if (request.url.includes("assemble_briefing")) return Response.json({ user_name: "Narayan", open_count: 0, lead_line: "Nothing urgent today.", open_items: "Nothing open.", last_call_summary: "", slot_local_time: "08:00" });
      if (request.url.endsWith("/v1/calls")) return new Response(null, { status: 409 });
      return new Response(null, { status: 204 });
    };
    await dispatchClaimedRun(run, baseDeps(fetchStub)).then(() => { throw new Error("409 must fail"); }, () => undefined);
    if (requests.filter((request) => request.url.endsWith("/v1/calls")).length !== 1) throw new Error("409 must not retry");
    const patch = requests.filter((request) => request.method === "PATCH").at(-1);
    if (!patch || !(await patch.text()).includes("idempotency_conflict")) throw new Error("409 was not recorded");
  });

  testFn("dispatch uses the committed CALL-E fixture and pins the complete request", async () => {
    const fixtures = await loadCallFixtures();
    const fixtureBytes = new TextEncoder().encode(JSON.stringify(fixtures.completed));
    const fixtureDigest = await crypto.subtle.digest("SHA-256", fixtureBytes);
    const fixtureHash = Array.from(new Uint8Array(fixtureDigest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (fixtureHash !== "8acba02e54af73b0c1a62b3d946aebb5df996074110cf80b1e16e02f19354f3e") {
      throw new Error("committed CALL-E fixture changed without dispatch review");
    }
    const requests: Request[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/profiles")) return Response.json([{ id: "user-1", phone_e164: "+919999999999", phone_confirmed_at: "2026-09-01T00:00:00Z" }]);
      if (request.url.includes("/consents")) return Response.json([{ id: "consent-1" }]);
      if (request.url.includes("/slots")) return Response.json([{ local_time: "08:00" }]);
      if (request.url.includes("assemble_briefing")) return Response.json({ user_name: "Narayan", open_count: 0, lead_line: "Nothing urgent today.", open_items: "Nothing open.", last_call_summary: "", slot_local_time: "08:00" });
      if (request.url.endsWith("/v1/calls")) return Response.json(fixtures.completed);
      return new Response(null, { status: 204 });
    };
    await dispatchClaimedRun(run, baseDeps(fetchStub));
    const request = requests.find((candidate) => candidate.url.endsWith("/v1/calls"));
    if (!request) throw new Error("dispatch did not call CALL-E");
    const body = await request.json() as CalleCallRequest;
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const requestHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (requestHash !== "628c5be36e81e4e591cb94373f5ca041b13e17d99249a1519bb17f1ee34fc831") {
      throw new Error("CALL-E request differs from the reviewed complete contract");
    }
    const patch = requests.filter((candidate) => candidate.method === "PATCH").at(-1);
    if (!patch || !(await patch.text()).includes(fixtures.completed.id)) {
      throw new Error("committed CALL-E fixture id was not stored");
    }
  });

  testFn("canonical runtime names derive the webhook URL", () => {
    const values: Record<string, string> = {
      ORMA_API_URL: "https://orma-api.nryn.dev/",
      ORMA_WEBHOOK_SECRET: "webhook-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      CALLE_API_BASE: "https://api.call-e.test",
      CALLE_API_KEY: "calle-key",
    };
    const deps = depsFromEnv((key) => values[key]);
    if (deps.webhookUrl !== "https://orma-api.nryn.dev/functions/v1/calle-webhook/webhook-secret") {
      throw new Error("webhook URL must derive from canonical runtime names");
    }
  });

  testFn("a dry run records the exact body the live path would send", async () => {
    const live: Request[] = [];
    await dispatchClaimedRun(run, baseDeps(stubFetch(live)));
    const liveRequest = live.find((candidate) => candidate.url.endsWith("/v1/calls"));
    if (!liveRequest) throw new Error("the live path did not call CALL-E");
    const liveBody = await liveRequest.text();

    const dry: Request[] = [];
    await dispatchClaimedRun({ ...run, dry_run: true }, baseDeps(stubFetch(dry)));
    if (dry.some((candidate) => candidate.url.endsWith("/v1/calls"))) {
      throw new Error("a dry run called CALL-E");
    }
    const posted = await Promise.all(
      dry.filter((candidate) => candidate.url.includes("call_events")).map(async (candidate) => await candidate.json()),
    );
    const dispatched = posted.find((event) => event.kind === "dispatched");
    if (!dispatched) throw new Error("a dry run recorded no dispatch");
    if (dispatched.detail.request_body !== liveBody) {
      throw new Error("the dry run recorded a different body than the live path sends");
    }
    if (dispatched.detail.outbound_request_made !== false) {
      throw new Error("the dry run claimed an outbound request");
    }
  });

  testFn("a dry run replays the recording into the ingestion seam", async () => {
    const seen: Request[] = [];
    await dispatchClaimedRun({ ...run, dry_run: true }, baseDeps(stubFetch(seen)));
    const ingest = seen.find((candidate) => candidate.url.includes("ingest_call_result"));
    if (!ingest) throw new Error("a dry run never reached the ingestion seam");
    const payload = await ingest.json() as Record<string, unknown>;
    if (payload.p_result_valid !== true) throw new Error("the recorded extraction was rejected");
    if ((payload.p_transcript_turns as unknown[]).length !== 27) throw new Error("the dry run lost the recorded transcript");
    const structured = payload.p_structured as { captured_items: Array<{ text: string }> };
    if (structured?.captured_items?.[0]?.text !== "Continental") throw new Error("the dry run lost the recorded extraction");
    if (payload.p_state !== "completed" || payload.p_disposition !== "answered_extracted") {
      throw new Error("the dry run synthesized the wrong terminal state");
    }
    const moved = seen.filter((candidate) => candidate.method === "PATCH").at(-1);
    if (!moved || !(await moved.text()).includes('"billable":false')) {
      throw new Error("a dry run did not move the run without billing it");
    }
  });
}
