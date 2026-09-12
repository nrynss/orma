/**
 * Claims due call runs. PostgreSQL owns the claim so concurrent cron requests
 * cannot send the same run to CALL-E twice.
 *
 * Dispatch arrives in T2.4. Until then, tick must not claim runs because a
 * claim cannot be put back after it commits.
 *
 * Pin with: deno test --allow-env --allow-net supabase/functions/tick/index.ts
 */

import { withSupabase } from "npm:@supabase/server@1.6.0";

const CLAIM_LIMIT = 20;

export type TickRun = {
  id: string;
  state: string;
  poll_after: string | null;
};

export type TickDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  fetch: typeof fetch;
  dispatchClaimed?: (run: TickRun) => Promise<void>;
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
  return {
    apiUrl: requireNamedEnv("ORMA_API_URL", getEnv),
    serviceRoleKey: requireNamedEnv("SUPABASE_SERVICE_ROLE_KEY", getEnv),
    fetch: fetchImpl,
    // T2.4 supplies dispatch. An absent dispatcher leaves scheduled rows
    // untouched, which is safe while this seam is deployed independently.
    dispatchClaimed: undefined,
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
export async function claimDueRuns(deps: TickDeps): Promise<TickRun[]> {
  const response = await deps.fetch(
    restUrl(deps.apiUrl, "rpc/claim_due_call_runs"),
    {
      method: "POST",
      headers: serviceHeaders(deps.serviceRoleKey),
      body: JSON.stringify({ p_limit: CLAIM_LIMIT }),
    },
  );
  if (!response.ok) throw new Error("due call_runs claim failed");
  return await response.json() as TickRun[];
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
    await Promise.all(claimed.map((run) => deps.dispatchClaimed!(run)));
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
  // The minute cron shares the scheduler credential created by T2.1.
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
}
