/**
 * The operator timeline outlives any one Edge Function invocation. Each call
 * transition writes one append-only row, which makes a run legible without
 * relying on scattered function logs.
 */

export const CALL_EVENT_KINDS = [
  "materialised",
  "claimed",
  "dispatched",
  "polled",
  "webhook_received",
  "refetched",
  "ingested",
  "finalised",
] as const;

export type CallEventKind = typeof CALL_EVENT_KINDS[number];
export type CallEventDetail = Record<string, JsonValue>;
export type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue;
};

export type EventDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  fetch: typeof fetch;
};

function apiBase(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  if (base.includes("supabase.co")) {
    throw new Error("must use ORMA_API_URL, not project host");
  }
  return base;
}

function eventHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
    prefer: "return=minimal",
  };
}

function isEventKind(value: string): value is CallEventKind {
  return (CALL_EVENT_KINDS as readonly string[]).includes(value);
}

function nonBlankString(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFailureState(state: string): boolean {
  return /(?:fail|error|cancel)/i.test(state);
}

function assertTerminalDetail(detail: CallEventDetail): void {
  if (!nonBlankString(detail.state)) {
    throw new Error("finalised call event requires a terminal state");
  }
  if (isFailureState(detail.state) && !nonBlankString(detail.failure_reason)) {
    throw new Error("failed finalised call event requires a failure reason");
  }
}

/**
 * Appends the transition to the run's timeline. Callers must include the
 * provider identifier, state, failure reason, or other durable observation
 * that explains this transition. Never put secrets or unmasked numbers here.
 */
export async function recordCallEvent(
  callRunId: string,
  kind: CallEventKind,
  detail: CallEventDetail,
  deps: EventDeps,
): Promise<void> {
  if (!callRunId) throw new Error("call event requires a call run id");
  if (!isEventKind(kind)) {
    throw new Error(`unsupported call event kind: ${kind}`);
  }
  if (kind === "finalised") assertTerminalDetail(detail);

  const response = await deps.fetch(
    `${apiBase(deps.apiUrl)}/rest/v1/call_events`,
    {
      method: "POST",
      headers: eventHeaders(deps.serviceRoleKey),
      body: JSON.stringify({ call_run_id: callRunId, kind, detail }),
    },
  );
  if (!response.ok) throw new Error("call event insert failed");
}

const testFn =
  (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void })
    .test;

if (typeof testFn === "function") {
  testFn(
    "records an append-only timeline row with durable detail",
    async () => {
      let request: Request | undefined;
      await recordCallEvent(
        "run-1",
        "dispatched",
        { calle_call_id: "call_123", state: "awaiting_result" },
        {
          apiUrl: "https://orma-api.nryn.dev",
          serviceRoleKey: "service-key",
          fetch: async (input, init) => {
            request = new Request(input, init);
            return new Response(null, { status: 201 });
          },
        },
      );
      if (!request || request.method !== "POST") {
        throw new Error("timeline must append with POST");
      }
      if (!request.url.endsWith("/rest/v1/call_events")) {
        throw new Error("timeline must write call_events");
      }
      const row = await request.json() as {
        call_run_id: string;
        kind: string;
        detail: CallEventDetail;
      };
      if (row.call_run_id !== "run-1" || row.kind !== "dispatched") {
        throw new Error("timeline row lost its transition");
      }
      if (row.detail.calle_call_id !== "call_123") {
        throw new Error("timeline row lost its durable detail");
      }
    },
  );

  testFn(
    "rejects an unknown transition before it reaches the database",
    async () => {
      let called = false;
      try {
        await recordCallEvent(
          "run-1",
          "logged" as CallEventKind,
          {},
          {
            apiUrl: "https://orma-api.nryn.dev",
            serviceRoleKey: "service-key",
            fetch: async () => {
              called = true;
              return new Response(null, { status: 201 });
            },
          },
        );
        throw new Error("unknown transition was accepted");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "unsupported call event kind: logged"
        ) {
          throw error;
        }
      }
      if (called) throw new Error("unknown transition reached the database");
    },
  );

  testFn(
    "rejects an opaque terminal failure before it reaches the database",
    async () => {
      let called = false;
      try {
        await recordCallEvent(
          "run-1",
          "finalised",
          { state: "failed" },
          {
            apiUrl: "https://orma-api.nryn.dev",
            serviceRoleKey: "service-key",
            fetch: async () => {
              called = true;
              return new Response(null, { status: 201 });
            },
          },
        );
        throw new Error("opaque terminal failure was accepted");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "failed finalised call event requires a failure reason"
        ) {
          throw error;
        }
      }
      if (called) throw new Error("opaque terminal failure reached the database");
    },
  );
}
