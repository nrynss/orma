/**
 * T2.7a finalise terminal runs.
 *
 * The poll and the webhook move a run to a terminal state and write no rows
 * about the call itself. Ingestion owns those rows, and it needs the
 * authoritative CALL-E payload. This module is the join between them. For one
 * terminal run it re-fetches the call, hands the payload to ingestion, and
 * records one `finalised` row on the timeline.
 *
 * Ingestion owns `completed_at`, and the tick selects terminal runs whose
 * `completed_at` is null. A successful ingest therefore removes the run from
 * the queue by itself. A failed re-fetch writes no call rows, so the run stays
 * queued. The tick isolates every finalise call, exactly as it isolates the
 * poll, so one run's failure costs no sibling.
 *
 * The work is bounded. A failed attempt is counted on the run and pushes
 * `finalise_after` into the future, so the tick skips the run for a wait and a
 * batch of stuck runs cannot hold every slot. After the last attempt this
 * module ends the run and names the reason on the timeline. A run with no
 * CALL-E call id has nothing to re-fetch, so it ends at once the same way.
 *
 * Those two give-up paths are the only place outside ingestion that writes
 * `completed_at`, and each writes a `finalised` row that names why.
 *
 * The re-fetch is the authority. A run the poll failed as unanswered is
 * written as completed when CALL-E later reports the call finished.
 *
 * Ingestion commits `completed_at` first, so a failed `finalised` append would
 * lose that row for good. `recordCallEvent` owns the append retry, from one
 * budget, and a lost append is named on the run row.
 *
 * A dry run never reaches this module. `dispatch-mode.ts` replays its recorded
 * fixture into ingestion inside the dispatch step, and ingestion completes the
 * run there.
 */

import type { CalleDeps } from "./calle.ts";
import { EVENT_APPEND_ATTEMPTS, recordCallEvent } from "./events.ts";
import type { CallTaskFixture } from "./fixtures.ts";
import {
  type IngestDeps,
  type IngestResult,
  ingestTerminalRun,
  type TerminalCallSource,
} from "./ingest.ts";
import { fetchCall, terminalStateFor, type TerminalState } from "./poll.ts";

/**
 * One terminal run, as the tick selects it. `calle_call_id` is null only for a
 * run the poll failed before CALL-E ever returned an id. Such a run has no call
 * to re-fetch, so the step ends it and names that reason on the timeline.
 */
export type FinaliseRun = {
  id: string;
  state: string;
  user_id: string;
  calle_call_id: string | null;
};

/** The reason a run with no provider call id is ended with. */
export const NO_CALL_ID_REASON = "the run has no CALL-E call id to re-fetch";

/** Failed attempts this module spends on one run before it ends the run. */
export const FINALISE_MAX_ATTEMPTS = 3;

/** The wait a failed attempt sets before the tick may select the run again. */
export const FINALISE_RETRY_WAIT_MS = 5 * 60_000;

/** Injected so the checks run without a real pause. */
export type Sleep = (ms: number) => Promise<void>;

const waitMs: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ingestion reads the REST transport only. The CALL-E key stays out of it. */
function ingestDeps(deps: CalleDeps): IngestDeps {
  return {
    apiUrl: deps.apiUrl,
    serviceRoleKey: deps.serviceRoleKey,
    fetch: deps.fetch,
  };
}

/**
 * The payload a re-fetched call carries into ingestion. The turns come from the
 * first attempt CALL-E reports, which is what `dryRunSource` reads out of a
 * recorded fixture, so a rehearsal and a live run ingest the same shape.
 */
function terminalCallSource(
  run: FinaliseRun,
  call: CallTaskFixture,
): TerminalCallSource {
  const attempt = call.recipients[0]?.attempts[0];
  return {
    callRunId: run.id,
    userId: run.user_id,
    raw: call,
    transcriptTurns: attempt?.transcript_turns ?? [],
    structuredResult: call.structured_result,
  };
}

/**
 * The reason the timeline names for a failed or canceled call. `call_events` is
 * a row an operator reads, so this carries the provider's failure code and
 * never its free text. Ingestion stores that message verbatim on the run.
 */
function failureReason(call: CallTaskFixture, state: TerminalState): string {
  if (state === "completed") return "";
  const code = typeof call.failure_code === "string" ? call.failure_code.trim() : "";
  return code || `CALL-E reported ${state} without a failure code`;
}

/**
 * What the `finalised` row records. The counts are ingestion's own, and the
 * state is the one the authoritative payload reports, which is what ingestion
 * has just written on the run.
 */
type FinalisedDetail = {
  calle_call_id: string;
  state: TerminalState;
  disposition: string;
  item_count: number;
  mention_count: number;
  retirement_count: number;
  commitment_count: number;
  failure_reason: string;
};

function finalisedDetail(
  call: CallTaskFixture,
  state: TerminalState,
  ingested: IngestResult,
): FinalisedDetail {
  return {
    calle_call_id: call.id,
    state,
    disposition: ingested.disposition,
    item_count: ingested.counts.items,
    mention_count: ingested.counts.mentions,
    retirement_count: ingested.counts.retirements,
    commitment_count: ingested.counts.commitments,
    failure_reason: failureReason(call, state),
  };
}

function apiBase(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  if (base.includes("supabase.co")) {
    throw new Error("must use ORMA_API_URL, not project host");
  }
  return base;
}

function serviceHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

/** What the attempt boundary reported back about one failed attempt. */
type AttemptOutcome = {
  attempts: number;
  finalised: boolean;
};

/**
 * Records one failed attempt through the SQL boundary that owns the attempt
 * count and the wait. The boundary answers with what the run row now holds, so
 * this module compares the database's count and never a count of its own.
 */
async function recordAttempt(
  run: FinaliseRun,
  reason: string,
  deps: CalleDeps,
): Promise<AttemptOutcome> {
  const response = await deps.fetch(
    `${apiBase(deps.apiUrl)}/rest/v1/rpc/record_finalise_failure`,
    {
      method: "POST",
      headers: serviceHeaders(deps.serviceRoleKey),
      body: JSON.stringify({
        p_call_run_id: run.id,
        p_wait_seconds: Math.round(FINALISE_RETRY_WAIT_MS / 1000),
        p_error: reason,
      }),
    },
  );
  if (!response.ok) throw new Error("finalise attempt could not be recorded");
  const body = await response.json() as { attempts?: unknown; finalised?: unknown };
  return {
    attempts: typeof body.attempts === "number" ? body.attempts : 0,
    finalised: body.finalised === true,
  };
}

/**
 * Ends a run this module can never finish, and says why on the timeline. The
 * SQL boundary ends the run and answers which writer won, so the reason is
 * appended exactly once even when two ticks give up together.
 */
async function abandonRun(
  run: FinaliseRun,
  reason: string,
  attempts: number,
  deps: CalleDeps,
  sleep: Sleep,
): Promise<void> {
  const response = await deps.fetch(
    `${apiBase(deps.apiUrl)}/rest/v1/rpc/abandon_call_run`,
    {
      method: "POST",
      headers: serviceHeaders(deps.serviceRoleKey),
      body: JSON.stringify({ p_call_run_id: run.id, p_reason: reason }),
    },
  );
  if (!response.ok) throw new Error("call_runs abandon failed");
  if (await response.json() !== true) return;
  await recordCallEvent(run.id, "finalised", {
    calle_call_id: run.calle_call_id,
    state: run.state,
    outcome: "abandoned",
    attempts,
    failure_reason: reason,
  }, deps, sleep);
}

/**
 * Decides what one failed attempt means. An attempt inside the limit leaves
 * the run queued and reports the failure. The last attempt ends the run, names
 * the reason on the timeline, and reports success, because the run is finished
 * and the queue is one shorter.
 */
async function attemptFailed(
  run: FinaliseRun,
  error: unknown,
  deps: CalleDeps,
  sleep: Sleep,
): Promise<null> {
  const reason = error instanceof Error ? error.message : "unknown error";
  let outcome: AttemptOutcome;
  try {
    outcome = await recordAttempt(run, reason, deps);
  } catch (recordError) {
    // The run stays queued for the next tick. The failure this attempt met is
    // the one worth reporting, so it is the one that travels.
    console.error(
      `finalise attempt was not recorded for run ${run.id}`,
      recordError instanceof Error ? recordError.message : "unknown error",
    );
    throw error;
  }
  if (outcome.finalised) {
    // A concurrent ingest finished the run while this attempt failed. There is
    // nothing left to finalise, and the run must never be re-fetched.
    console.error(`finalise attempt raced a finished run ${run.id}`, reason);
    return null;
  }
  if (outcome.attempts < FINALISE_MAX_ATTEMPTS) throw error;
  await abandonRun(
    run,
    `${reason} after ${outcome.attempts} attempts`,
    outcome.attempts,
    deps,
    sleep,
  );
  return null;
}

/**
 * Finalises one terminal run. Nothing is written before the ingest lands, so a
 * failed re-fetch leaves the run queued with no partial state anywhere. This is
 * the pass without the attempt bound, and `finaliseStep` is what the tick runs.
 */
export async function finaliseRun(
  run: FinaliseRun,
  deps: CalleDeps,
  sleep: Sleep = waitMs,
): Promise<IngestResult> {
  if (!run.calle_call_id) {
    throw new Error(`call run ${run.id} has no CALL-E call id to re-fetch`);
  }
  const call = await fetchCall(run.calle_call_id, deps);
  const ingested = await ingestTerminalRun(
    terminalCallSource(run, call),
    ingestDeps(deps),
  );
  // A replay means a concurrent finaliser already committed the rows and the
  // `ingested` row with them. Its own `finalised` row stands, and the zero
  // counts this summary carries would misreport the run.
  if (ingested.alreadyIngested) return ingested;
  // Ingestion refuses a non-terminal payload, so the state is known here.
  const state = terminalStateFor(call.status);
  if (!state) throw new Error(`CALL-E reports ${call.status} for a finalised run`);
  await recordCallEvent(
    run.id,
    "finalised",
    finalisedDetail(call, state, ingested),
    deps,
    sleep,
  );
  return ingested;
}

/**
 * One run's finalise step, with the attempt bound around it. The tick wires
 * this as its finalise step, so a terminal run either lands, waits for its next
 * attempt, or is ended with a reason. None of them is retried forever.
 */
export async function finaliseStep(
  run: FinaliseRun,
  deps: CalleDeps,
  sleep: Sleep = waitMs,
): Promise<IngestResult | null> {
  if (!run.calle_call_id) {
    // Nothing to re-fetch, ever. A wait here would only hold a batch slot.
    await abandonRun(run, NO_CALL_ID_REASON, 0, deps, sleep);
    return null;
  }
  try {
    return await finaliseRun(run, deps, sleep);
  } catch (error) {
    return await attemptFailed(run, error, deps, sleep);
  }
}

const testFn =
  (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void })
    .test;

if (typeof testFn === "function") {
  const RUN: FinaliseRun = {
    id: "11111111-1111-4111-8111-111111111111",
    state: "failed",
    user_id: "33333333-3333-4333-8333-333333333333",
    calle_call_id: "call_finalise_1",
  };
  const API = "https://orma-api.nryn.dev";
  const CALLE = "https://api.call-e.test";
  const CALLE_HOST = new URL(CALLE).host;

  /** Every stub throws on a path it does not expect, so no request passes
   * unnoticed and no run row can be written behind the ingestion seam. */
  const depsFor = (fetchImpl: typeof fetch): CalleDeps => ({
    apiUrl: API,
    serviceRoleKey: "service-key",
    calleApiBase: CALLE,
    calleApiKey: "calle-key",
    webhookUrl: `${API}/functions/v1/calle-webhook/secret`,
    fetch: fetchImpl,
    now: () => new Date("2026-09-12T00:00:00.000Z"),
  });

  const payload = (overrides: Record<string, unknown> = {}): unknown => ({
    id: RUN.calle_call_id,
    object: "call_task",
    status: "completed",
    task: "the briefing",
    recipients: [{
      id: "rcp_1",
      status: "completed",
      structured_result: null,
      summary: "done",
      attempts: [{
        id: "att_1",
        status: "completed",
        transcript_turns: [
          { offset_seconds: 12, speaker: "callee", text: "Renew the passport" },
        ],
      }],
    }],
    structured_result: {
      captured_items: [
        { text: "Renew the passport", evidence_offset_seconds: 12 },
      ],
      retired_items: [],
    },
    completion_confidence: { score: 0.8, label: "high" },
    failure_code: null,
    failure_message: null,
    created_at: "2026-09-12T00:00:01.000Z",
    completed_at: "2026-09-12T00:00:05.000Z",
    ...overrides,
  });

  const summary = (overrides: Record<string, unknown> = {}): unknown => ({
    already_ingested: false,
    disposition: "answered_extracted",
    counts: { items: 1, mentions: 1, retirements: 0, commitments: 0 },
    slot_change_requested: null,
    ...overrides,
  });

  const driver = (call: unknown, ingest: unknown = summary()) => {
    const seen: Request[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      const url = new URL(request.url);
      if (url.host === CALLE_HOST) return Response.json(call);
      if (url.pathname === "/rest/v1/rpc/ingest_call_result") {
        return Response.json(ingest);
      }
      if (url.pathname === "/rest/v1/call_events") {
        return new Response(null, { status: 201 });
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`);
    };
    return { seen, deps: depsFor(fetchImpl) };
  };

  /**
   * Drives one bounded finalise step. The attempt boundary, the give-up
   * boundary and the timeline append are stubs, so a check reads what this
   * module asked each of them for.
   */
  const stepDriver = (options: {
    call?: unknown;
    callStatus?: number;
    attempt?: { attempts: number; finalised: boolean };
    abandonWon?: boolean;
    eventStatus?: () => number;
  } = {}) => {
    const seen: Request[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      const url = new URL(request.url);
      if (url.host === CALLE_HOST) {
        if (options.callStatus) return new Response(null, { status: options.callStatus });
        return Response.json(options.call ?? payload());
      }
      if (url.pathname.endsWith("/rpc/ingest_call_result")) {
        return Response.json(summary());
      }
      if (url.pathname.endsWith("/rpc/record_finalise_failure")) {
        return Response.json(options.attempt ?? { attempts: 1, finalised: false });
      }
      if (url.pathname.endsWith("/rpc/abandon_call_run")) {
        return Response.json(options.abandonWon ?? true);
      }
      if (url.pathname === "/rest/v1/call_events") {
        return new Response(null, { status: options.eventStatus ? options.eventStatus() : 201 });
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`);
    };
    return { seen, deps: depsFor(fetchImpl) };
  };

  /** The checks never wait on a real clock. */
  const instant: Sleep = async () => {};

  testFn(
    "a terminal run is re-fetched, ingested and named on the timeline",
    async () => {
      const { seen, deps } = driver(payload());
      const ingested = await finaliseRun(RUN, deps);

      const refetch = seen.find((request) => new URL(request.url).host === CALLE_HOST);
      if (
        !refetch || refetch.method !== "GET" ||
        !refetch.url.endsWith(`/v1/calls/${RUN.calle_call_id}`)
      ) {
        throw new Error("the finaliser must re-fetch the authoritative call");
      }
      const ingestRequest = seen.find((request) =>
        request.url.endsWith("/rpc/ingest_call_result")
      );
      if (!ingestRequest || ingestRequest.method !== "POST") {
        throw new Error("a re-fetched call must reach ingestion");
      }
      const body = await ingestRequest.json() as Record<string, unknown>;
      if (body.p_call_run_id !== RUN.id || body.p_user_id !== RUN.user_id) {
        throw new Error("ingestion lost the run identity");
      }
      if ((body.p_transcript_turns as unknown[]).length !== 1) {
        throw new Error("the re-fetched transcript did not reach ingestion");
      }
      if (body.p_state !== "completed" || body.p_disposition !== "answered_extracted") {
        throw new Error("the payload's own state did not reach ingestion");
      }
      if (body.p_completed_at !== "2026-09-12T00:00:05.000Z") {
        throw new Error("the provider completion time did not reach ingestion");
      }
      if (ingested.disposition !== "answered_extracted" || ingested.counts.items !== 1) {
        throw new Error("the ingest summary was not handed back");
      }

      const event = seen.find((request) => request.url.endsWith("/call_events"));
      if (!event || event.method !== "POST") {
        throw new Error("a finalised run must record its own timeline row");
      }
      const row = await event.json() as {
        call_run_id: string;
        kind: string;
        detail: Record<string, unknown>;
      };
      if (row.call_run_id !== RUN.id || row.kind !== "finalised") {
        throw new Error("the timeline row lost its run or its transition");
      }
      const detail = row.detail;
      if (detail.state !== "completed" || detail.disposition !== "answered_extracted") {
        throw new Error("the finalised row lost the state or the disposition");
      }
      if (
        detail.item_count !== 1 || detail.mention_count !== 1 ||
        detail.retirement_count !== 0 || detail.commitment_count !== 0
      ) {
        throw new Error(`the finalised row lost its counts: ${JSON.stringify(detail)}`);
      }
      if (detail.calle_call_id !== RUN.calle_call_id) {
        throw new Error("the finalised row lost the provider call id");
      }
    },
  );

  testFn("a failed re-fetch leaves the run queued and writes nothing", async () => {
    const seen: Request[] = [];
    const deps = depsFor(async (input) => {
      const request = new Request(input);
      seen.push(request);
      if (new URL(request.url).host !== CALLE_HOST) {
        throw new Error(`unexpected request ${request.url}`);
      }
      return new Response(null, { status: 503 });
    });
    await finaliseRun(RUN, deps).then(
      () => {
        throw new Error("a failed re-fetch was reported as a finalised run");
      },
      (error) => {
        if (!(error instanceof Error) || !error.message.includes("503")) throw error;
      },
    );
    if (seen.length !== 1) {
      throw new Error(`a failed re-fetch made ${seen.length - 1} further request(s)`);
    }
  });

  testFn(
    "a run with no CALL-E call id is not re-fetched and stays queued",
    async () => {
      let called = false;
      const deps = depsFor(async () => {
        called = true;
        return Response.json(payload());
      });
      await finaliseRun({ ...RUN, calle_call_id: null }, deps).then(
        () => {
          throw new Error("a run with no call id was reported as finalised");
        },
        (error) => {
          if (!(error instanceof Error) || !error.message.includes("no CALL-E call id")) {
            throw error;
          }
        },
      );
      if (called) throw new Error("a run with no call id must not reach the network");
    },
  );

  testFn("the authoritative payload decides the state the timeline records", async () => {
    // The poll gave up on this call and stored `failed` with no completion time.
    // CALL-E later reports the call completed, and that is the truth the run takes.
    const { seen, deps } = driver(payload());
    await finaliseRun(RUN, deps);
    const event = seen.find((request) => request.url.endsWith("/call_events"));
    const row = await event!.json() as { detail: Record<string, unknown> };
    if (row.detail.state !== "completed" || row.detail.failure_reason !== "") {
      throw new Error(`a recovered call kept its stored failure: ${JSON.stringify(row.detail)}`);
    }
  });

  testFn("a failed call names the provider's code and not its free text", async () => {
    const { seen, deps } = driver(payload({
      status: "failed",
      failure_code: "call_failed",
      failure_message: "calling task status=NO ANSWER (Hangup by: bot)",
    }), summary({
      disposition: "not_answered",
      counts: { items: 0, mentions: 0, retirements: 0, commitments: 0 },
    }));
    await finaliseRun(RUN, deps);
    const event = seen.find((request) => request.url.endsWith("/call_events"));
    const row = await event!.json() as { detail: Record<string, unknown> };
    if (row.detail.state !== "failed" || row.detail.failure_reason !== "call_failed") {
      throw new Error(`the failure reason is not the provider's code: ${JSON.stringify(row.detail)}`);
    }
    if (JSON.stringify(row.detail).includes("NO ANSWER")) {
      throw new Error("the timeline row pasted the provider's free text");
    }
  });

  testFn("a canceled call still names a failure reason", async () => {
    const { seen, deps } = driver(
      payload({ status: "canceled", failure_code: null, failure_message: null }),
      summary({
        disposition: "canceled",
        counts: { items: 0, mentions: 0, retirements: 0, commitments: 0 },
      }),
    );
    await finaliseRun(RUN, deps);
    const event = seen.find((request) => request.url.endsWith("/call_events"));
    const row = await event!.json() as { detail: Record<string, unknown> };
    if (row.detail.state !== "canceled" || row.detail.failure_reason === "") {
      throw new Error(`a canceled run needs a reason: ${JSON.stringify(row.detail)}`);
    }
  });

  testFn("a replay writes no second timeline row", async () => {
    const { seen, deps } = driver(payload(), summary({
      already_ingested: true,
      counts: { items: 0, mentions: 0, retirements: 0, commitments: 0 },
    }));
    const ingested = await finaliseRun(RUN, deps);
    if (!ingested.alreadyIngested) {
      throw new Error("the replay marker was not handed back");
    }
    if (seen.some((request) => request.url.endsWith("/call_events"))) {
      throw new Error("a replay wrote a second finalised row");
    }
  });

  testFn("a call CALL-E has not finished cannot be finalised", async () => {
    const { seen, deps } = driver(payload({ status: "in_progress" }));
    await finaliseRun(RUN, deps).then(
      () => {
        throw new Error("a pending call was reported as finalised");
      },
      (error) => {
        if (!(error instanceof Error) || !error.message.includes("terminal call status")) {
          throw error;
        }
      },
    );
    if (seen.length !== 1) {
      throw new Error("a pending call must not write anything");
    }
  });

  testFn("a failed attempt is counted on the run and the run stays queued", async () => {
    const { seen, deps } = stepDriver({
      callStatus: 503,
      attempt: { attempts: 1, finalised: false },
    });
    await finaliseStep(RUN, deps, instant).then(
      () => {
        throw new Error("a failed attempt was reported as a finished run");
      },
      (error) => {
        if (!(error instanceof Error) || !error.message.includes("503")) throw error;
      },
    );
    const record = seen.find((request) =>
      request.url.endsWith("/rpc/record_finalise_failure")
    );
    if (!record || record.method !== "POST") {
      throw new Error("a failed attempt must be counted on the run");
    }
    const body = await record.json() as {
      p_call_run_id?: string;
      p_wait_seconds?: number;
      p_error?: string;
    };
    if (body.p_call_run_id !== RUN.id) {
      throw new Error("the attempt lost the run");
    }
    if (body.p_wait_seconds !== FINALISE_RETRY_WAIT_MS / 1000) {
      throw new Error(`the attempt lost its wait: ${JSON.stringify(body)}`);
    }
    if (!body.p_error?.includes("503")) {
      throw new Error(`the attempt lost the failure: ${JSON.stringify(body)}`);
    }
    const ended = seen.some((request) =>
      request.url.endsWith("/call_events") ||
      request.url.endsWith("/rpc/abandon_call_run")
    );
    if (ended) throw new Error("an attempt inside the limit ended the run");
  });

  testFn("the last attempt ends the run and names the reason", async () => {
    const { seen, deps } = stepDriver({
      callStatus: 503,
      attempt: { attempts: FINALISE_MAX_ATTEMPTS, finalised: false },
    });
    const finished = await finaliseStep(RUN, deps, instant);
    if (finished !== null) {
      throw new Error("a given-up run must report no ingest");
    }
    const abandon = seen.find((request) =>
      request.url.endsWith("/rpc/abandon_call_run")
    );
    if (!abandon || abandon.method !== "POST") {
      throw new Error("the last attempt must end the run");
    }
    const abandonBody = await abandon.json() as {
      p_call_run_id?: string;
      p_reason?: string;
    };
    if (
      abandonBody.p_call_run_id !== RUN.id ||
      !abandonBody.p_reason?.includes("503") ||
      !abandonBody.p_reason.includes(`${FINALISE_MAX_ATTEMPTS} attempts`)
    ) {
      throw new Error(`the give-up lost its run or its reason: ${JSON.stringify(abandonBody)}`);
    }
    const event = seen.find((request) => request.url.endsWith("/call_events"));
    const row = await event!.json() as {
      kind?: string;
      detail?: Record<string, unknown>;
    };
    if (row.kind !== "finalised" || row.detail?.outcome !== "abandoned") {
      throw new Error(`the give-up must name itself on the timeline: ${JSON.stringify(row)}`);
    }
    if (
      row.detail?.state !== RUN.state ||
      row.detail?.attempts !== FINALISE_MAX_ATTEMPTS ||
      typeof row.detail?.failure_reason !== "string" ||
      row.detail.failure_reason === ""
    ) {
      throw new Error(`the give-up row lost its state, attempts or reason: ${JSON.stringify(row.detail)}`);
    }
  });

  testFn("a run with no call id ends at once and names why", async () => {
    const { seen, deps } = stepDriver();
    const finished = await finaliseStep({ ...RUN, calle_call_id: null }, deps, instant);
    if (finished !== null) {
      throw new Error("a run with no call id reported an ingest");
    }
    if (seen.some((request) => new URL(request.url).host === CALLE_HOST)) {
      throw new Error("a run with no call id must not reach CALL-E");
    }
    if (seen.some((request) => request.url.endsWith("/rpc/record_finalise_failure"))) {
      throw new Error("a run with nothing to re-fetch must not spend an attempt");
    }
    const abandon = seen.find((request) =>
      request.url.endsWith("/rpc/abandon_call_run")
    );
    if (!abandon) throw new Error("a run with no call id must be ended");
    const abandonBody = await abandon.json() as { p_reason?: string };
    if (abandonBody.p_reason !== NO_CALL_ID_REASON) {
      throw new Error(`the ended run lost its reason: ${JSON.stringify(abandonBody)}`);
    }
    const event = seen.find((request) => request.url.endsWith("/call_events"));
    const row = await event!.json() as {
      kind?: string;
      detail?: Record<string, unknown>;
    };
    if (row.kind !== "finalised" || row.detail?.failure_reason !== NO_CALL_ID_REASON) {
      throw new Error(`the timeline must name why the run ended: ${JSON.stringify(row)}`);
    }
  });

  testFn("a transient timeline failure is retried and the row still lands", async () => {
    let appends = 0;
    const { seen, deps } = stepDriver({
      eventStatus: () => (++appends === 1 ? 500 : 201),
    });
    const ingested = await finaliseRun(RUN, deps, instant);
    if (ingested.disposition !== "answered_extracted") {
      throw new Error("the ingest summary was lost");
    }
    const events = seen.filter((request) =>
      request.url.endsWith("/call_events")
    );
    if (appends !== 2 || events.length !== 2) {
      throw new Error(`the append was attempted ${appends} time(s)`);
    }
    const row = await events[1].json() as { kind?: string };
    if (row.kind !== "finalised") {
      throw new Error("the retried append lost its transition");
    }
  });

  testFn("a lost finalised append never becomes a second ingest", async () => {
    const { seen, deps } = stepDriver({
      eventStatus: () => 500,
      attempt: { attempts: 0, finalised: true },
    });
    const finished = await finaliseStep(RUN, deps, instant);
    if (finished !== null) {
      throw new Error("a run whose ingest landed must not be given up on");
    }
    const ingests = seen.filter((request) =>
      request.url.endsWith("/rpc/ingest_call_result")
    );
    if (ingests.length !== 1) {
      throw new Error(`the run was ingested ${ingests.length} time(s)`);
    }
    const appends = seen.filter((request) =>
      request.url.endsWith("/call_events")
    );
    // One budget, owned by `recordCallEvent`. A second wrapper here would make
    // this nine requests, and the loss record on the run row is what stays.
    if (appends.length !== EVENT_APPEND_ATTEMPTS) {
      throw new Error(`the append must be attempted ${EVENT_APPEND_ATTEMPTS} times, saw ${appends.length}`);
    }
    if (seen.some((request) => request.url.endsWith("/rpc/abandon_call_run"))) {
      throw new Error("a run whose ingest landed must never be abandoned");
    }
  });
}
