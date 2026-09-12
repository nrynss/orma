/**
 * Claims due call runs. PostgreSQL owns the claim so concurrent cron requests
 * cannot send the same run to CALL-E twice.
 *
 * T2.4 wires each claimed run to the guarded CALL-E dispatcher.
 *
 * Pin with: deno test --allow-env --allow-net supabase/functions/tick/index.ts
 */

import { withSupabase } from "npm:@supabase/server@1.6.0";
import { dispatchClaimedRun, depsFromEnv as calleDepsFromEnv } from "../_shared/calle.ts";
import { recordCallEvent } from "../_shared/events.ts";

const CLAIM_LIMIT = 20;

export type TickRun = {
  id: string;
  state: string;
  poll_after: string | null;
};

export type ClaimedTickRun = TickRun & {
  user_id: string;
  idempotency_key: string;
  slot_id: string | null;
};

export type TickDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  fetch: typeof fetch;
  dispatchClaimed?: (run: ClaimedTickRun) => Promise<void>;
  pollDue: (run: TickRun) => Promise<void>;
  finalise: (run: TickRun) => Promise<void>;
  now: () => Date;
};

export type TickResult = {
  claimed: number;
  polled: number;
  finalised: number;
};

export function requireNamedEnv(
  name: string,
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
): string {
  const value = getEnv(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function unavailable(stage: string): (run: TickRun) => Promise<void> {
  return async () => {
    throw new Error(`${stage} implementation is unavailable`);
  };
}

export function depsFromEnv(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
  fetchImpl: typeof fetch = fetch,
): TickDeps {
  const calleDeps = calleDepsFromEnv(getEnv, fetchImpl);
  return {
    apiUrl: requireNamedEnv("ORMA_API_URL", getEnv),
    serviceRoleKey: requireNamedEnv("SUPABASE_SERVICE_ROLE_KEY", getEnv),
    fetch: fetchImpl,
    dispatchClaimed: (run) => dispatchClaimedRun(run, calleDeps),
    pollDue: unavailable("poll"),
    finalise: unavailable("finalisation"),
    now: () => new Date(),
  };
}

function serviceHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

function restUrl(base: string, path: string, query = ""): string {
  return `${base.replace(/\/+$/, "")}/rest/v1/${path}${
    query ? `?${query}` : ""
  }`;
}

async function readRows(
  deps: TickDeps,
  query: URLSearchParams,
): Promise<TickRun[]> {
  const response = await deps.fetch(
    restUrl(deps.apiUrl, "call_runs", query.toString()),
    {
      headers: serviceHeaders(deps.serviceRoleKey),
    },
  );
  if (!response.ok) throw new Error("call_runs read failed");
  return await response.json() as TickRun[];
}

/** Calls the only SQL boundary allowed to claim runs. Do not replace this with
 * a REST PATCH: PostgREST cannot provide a `FOR UPDATE SKIP LOCKED` claim.
 */
export async function claimDueRuns(deps: TickDeps): Promise<ClaimedTickRun[]> {
  const response = await deps.fetch(
    restUrl(deps.apiUrl, "rpc/claim_due_call_runs"),
    {
      method: "POST",
      headers: serviceHeaders(deps.serviceRoleKey),
      body: JSON.stringify({ p_limit: CLAIM_LIMIT }),
    },
  );
  if (!response.ok) throw new Error("due call_runs claim failed");
  return await response.json() as ClaimedTickRun[];
}

export async function duePolls(deps: TickDeps): Promise<TickRun[]> {
  const query = new URLSearchParams({
    select: "id,state,poll_after",
    state: "in.(dispatched,awaiting_result)",
    poll_after: `lte.${deps.now().toISOString()}`,
    order: "poll_after",
    limit: String(CLAIM_LIMIT),
  });
  return readRows(deps, query);
}

export async function terminalRuns(deps: TickDeps): Promise<TickRun[]> {
  const query = new URLSearchParams({
    select: "id,state,poll_after",
    state: "in.(completed,no_result,failed,canceled)",
    completed_at: "is.null",
    order: "scheduled_for",
    limit: String(CLAIM_LIMIT),
  });
  return readRows(deps, query);
}

export async function tick(deps: TickDeps): Promise<TickResult> {
  const claimed = deps.dispatchClaimed ? await claimDueRuns(deps) : [];
  if (deps.dispatchClaimed) {
    await Promise.all(claimed.map(async (run) => {
      await recordCallEvent(run.id, "claimed", { state: run.state }, deps);
      await deps.dispatchClaimed!(run);
    }));
  }

  const polls = await duePolls(deps);
  await Promise.all(polls.map((run) => deps.pollDue(run)));

  const terminal = await terminalRuns(deps);
  await Promise.all(terminal.map((run) => deps.finalise(run)));

  return {
    claimed: claimed.length,
    polled: polls.length,
    finalised: terminal.length,
  };
}

export function createTickHandler(
  deps: TickDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    try {
      return Response.json(await tick(deps));
    } catch (error) {
      console.error(
        "tick failed",
        error instanceof Error ? error.message : "unknown error",
      );
      return new Response(null, { status: 500 });
    }
  };
}

export function createAuthenticatedTickHandler(
  deps: TickDeps,
): (request: Request) => Promise<Response> {
  // The minute cron shares the Vault-backed scheduler credential from T2.1.
  return withSupabase({ auth: "secret:materialise" }, createTickHandler(deps));
}

if (import.meta.main) Deno.serve(createAuthenticatedTickHandler(depsFromEnv()));

const testFn =
  (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void })
    .test;
if (typeof testFn === "function" && !import.meta.main) {
  const baseDeps = (fetchImpl: typeof fetch): TickDeps => ({
    apiUrl: "https://orma-api.nryn.dev",
    serviceRoleKey: "test-service-key",
    fetch: fetchImpl,
    dispatchClaimed: async () => undefined,
    pollDue: async () => undefined,
    finalise: async () => undefined,
    now: () => new Date("2026-09-12T00:00:00.000Z"),
  });

  testFn(
    "a tick without dispatch leaves scheduled runs unclaimed",
    async () => {
      const calls: string[] = [];
      const fetchStub: typeof fetch = async (input) => {
        calls.push(new URL(String(input)).pathname);
        return Response.json([]);
      };
      const deps = baseDeps(fetchStub);
      deps.dispatchClaimed = undefined;
      const result = await tick(deps);
      if (result.claimed !== 0) {
        throw new Error("an unavailable dispatcher must prevent claims");
      }
      if (calls.some((path) => path.endsWith("/rpc/claim_due_call_runs"))) {
        throw new Error(
          "an unavailable dispatcher must not call the claim RPC",
        );
      }
    },
  );

  testFn(
    "a tick with nothing due does not call a row mutation endpoint",
    async () => {
      const calls: Array<{ path: string; method: string }> = [];
      const fetchStub: typeof fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        calls.push({ path: url.pathname, method: init.method ?? "GET" });
        return Response.json([]);
      };
      const result = await tick(baseDeps(fetchStub));
      if (
        result.claimed !== 0 || result.polled !== 0 || result.finalised !== 0
      ) throw new Error("expected no work");
      if (
        calls.some((call) =>
          call.path.endsWith("/call_runs") && call.method !== "GET"
        )
      ) {
        throw new Error("an empty tick must not mutate a call run");
      }
    },
  );

  testFn(
    "claiming uses the atomic RPC with the bounded batch size",
    async () => {
      let request: Request | undefined;
      const fetchStub: typeof fetch = async (input, init = {}) => {
        request = new Request(String(input), init);
        return Response.json([]);
      };
      await claimDueRuns(baseDeps(fetchStub));
      if (
        !request || !request.url.endsWith("/rest/v1/rpc/claim_due_call_runs") ||
        request.method !== "POST"
      ) {
        throw new Error("claim must use the SQL RPC");
      }
      if (await request.text() !== '{"p_limit":20}') {
        throw new Error("claim must preserve the batch bound");
      }
    },
  );

  testFn(
    "configured tick claims a due run and reaches CALL-E dispatch",
    async () => {
      const requests: Request[] = [];
      const fetchStub: typeof fetch = async (input, init) => {
        const request = new Request(String(input), init);
        requests.push(request);
        if (request.url.endsWith("/rpc/claim_due_call_runs")) {
          return Response.json([{
            id: "run-1",
            state: "claimed",
            poll_after: null,
            user_id: "user-1",
            idempotency_key: "orma:user-1:2026-09-12:morning:v1",
            slot_id: "slot-1",
          }]);
        }
        if (request.url.includes("/profiles")) {
          return Response.json([{ id: "user-1", phone_e164: "+919999999999", phone_confirmed_at: "2026-09-01T00:00:00Z" }]);
        }
        if (request.url.includes("/consents")) return Response.json([{ id: "consent-1" }]);
        if (request.url.includes("/slots")) return Response.json([{ local_time: "08:00" }]);
        if (request.url.includes("assemble_briefing")) {
          return Response.json({ user_name: "Narayan", open_count: 0, lead_line: "Nothing urgent today.", open_items: "Nothing open.", last_call_summary: "", slot_local_time: "08:00" });
        }
        if (request.url.endsWith("/v1/calls")) {
          return Response.json({ id: "call-1", status: "queued", completion_confidence: null });
        }
        return Response.json([]);
      };
      const env: Record<string, string> = {
        ORMA_API_URL: "https://orma-api.nryn.dev",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        CALLE_API_BASE: "https://api.call-e.test",
        CALLE_API_KEY: "calle-key",
        ORMA_WEBHOOK_SECRET: "webhook-secret",
      };
      const result = await tick(depsFromEnv((key) => env[key], fetchStub));
      if (result.claimed !== 1) throw new Error("configured tick did not claim the due run");
      if (!requests.some((request) => request.url.endsWith("/v1/calls"))) {
        throw new Error("configured tick did not dispatch the claimed run to CALL-E");
      }
    },
  );

  testFn("only the named scheduler secret API key reaches tick", async () => {
    const oldUrl = Deno.env.get("SUPABASE_URL");
    const oldKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const oldPublishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    Deno.env.set("SUPABASE_URL", "https://orma-api.nryn.dev");
    Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ materialise: "fixture-materialise-key" }));
    Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: "fixture-publishable-key" }));
    let reads = 0;
    const handler = createAuthenticatedTickHandler({
      ...baseDeps(async () => {
        reads += 1;
        return Response.json([]);
      }),
      dispatchClaimed: undefined,
    });
    try {
      const rejected = await handler(new Request("https://orma-api.nryn.dev/functions/v1/tick", { method: "POST" }));
      if (rejected.status !== 401 || reads !== 0) throw new Error("missing secret must not reach tick");
      const accepted = await handler(new Request("https://orma-api.nryn.dev/functions/v1/tick", {
        method: "POST", headers: { apikey: "fixture-materialise-key" },
      }));
      if (accepted.status !== 200 || Number(reads) !== 2) {
        throw new Error("named scheduler secret must authenticate tick");
      }
    } finally {
      if (oldUrl === undefined) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", oldUrl);
      if (oldKeys === undefined) Deno.env.delete("SUPABASE_SECRET_KEYS"); else Deno.env.set("SUPABASE_SECRET_KEYS", oldKeys);
      if (oldPublishableKeys === undefined) Deno.env.delete("SUPABASE_PUBLISHABLE_KEYS");
      else Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", oldPublishableKeys);
    }
  });
}
