/**
 * T2.8 dry dispatch mode.
 *
 * This module deliberately has no CALL-E URL, key, or fetch dependency. The
 * live dispatcher hands it the already-serialized body, so dry mode can prove
 * exactly what it would have sent while being structurally unable to dial.
 */

import { loadCallFixtures, type CallTaskFixture } from "./fixtures.ts";

export type DryRunFixtureName = "completed" | "failed";

export type DryRunTerminalPatch = {
  state: "completed" | "failed" | "canceled";
  disposition: "answered_extracted" | "answered_no_result" | "not_answered" | "canceled";
  calle_call_id: string;
  calle_confidence: CallTaskFixture["completion_confidence"];
  calle_failure: { failure_code: string; failure_message: string } | null;
  billable: false;
  dispatched_at: string;
  completed_at: string;
};

export type DryRunEvent = {
  callRunId: string;
  kind: "dispatched" | "finalised";
  detail: Record<string, string | boolean>;
};

export type DryRunDeps = {
  recordEvent: (event: DryRunEvent) => Promise<void>;
  updateRun: (callRunId: string, patch: DryRunTerminalPatch) => Promise<void>;
  now: () => Date;
};

export type DryRunResult = {
  fixture: CallTaskFixture;
  requestBody: string;
  patch: DryRunTerminalPatch;
};

function parseBoolean(name: string, value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

/**
 * Global dry mode defaults on. A run can independently force dry mode when an
 * operator has enabled live dispatch globally for a controlled run.
 */
export function isDryRun(
  runDryRun: boolean,
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): boolean {
  return runDryRun || parseBoolean("ORMA_DRY_RUN", getEnv("ORMA_DRY_RUN")) !== false;
}

/**
 * Validates but does not rewrite the request. Keeping this string unchanged is
 * what makes the persisted dry-run body byte-identical to live dispatch.
 */
export function exactRequestBody(requestBody: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    throw new Error("dry-run request body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("dry-run request body must be a JSON object");
  }
  return requestBody;
}

function terminalState(fixture: CallTaskFixture): DryRunTerminalPatch["state"] {
  if (fixture.status === "completed") return "completed";
  if (fixture.status === "canceled") return "canceled";
  if (fixture.status === "failed") return "failed";
  throw new Error("dry-run fixture must be terminal");
}

function dispositionFor(
  state: DryRunTerminalPatch["state"],
  fixture: CallTaskFixture,
): DryRunTerminalPatch["disposition"] {
  if (state === "canceled") return "canceled";
  if (state === "failed") return "not_answered";
  return fixture.structured_result === null ? "answered_no_result" : "answered_extracted";
}

export function terminalPatchFromFixture(
  fixture: CallTaskFixture,
  now: Date,
): DryRunTerminalPatch {
  const state = terminalState(fixture);
  const failureCode = fixture.failure_code;
  const failureMessage = fixture.failure_message;
  return {
    state,
    disposition: dispositionFor(state, fixture),
    // Mark this as synthetic so it can never be mistaken for a provider id.
    calle_call_id: `fixture:${fixture.id}`,
    calle_confidence: fixture.completion_confidence,
    calle_failure: failureCode
      ? { failure_code: failureCode, failure_message: failureMessage ?? "" }
      : null,
    billable: false,
    dispatched_at: now.toISOString(),
    completed_at: fixture.completed_at ?? now.toISOString(),
  };
}

/**
 * Persist the exact would-be request and move the run to the selected terminal
 * fixture. This does not receive a fetch implementation by design.
 */
export async function executeDryRun(
  callRunId: string,
  requestBody: string,
  fixture: CallTaskFixture,
  deps: DryRunDeps,
): Promise<DryRunResult> {
  if (!callRunId) throw new Error("dry-run dispatch requires a call run id");
  const exactBody = exactRequestBody(requestBody);
  const selectedFixture: DryRunFixtureName = fixture.status === "completed" ? "completed" : "failed";
  const now = deps.now();
  const patch = terminalPatchFromFixture(fixture, now);

  await deps.recordEvent({
    callRunId,
    kind: "dispatched",
    detail: {
      dispatch_mode: "dry_run",
      fixture: selectedFixture,
      outbound_request_made: false,
      request_body: exactBody,
    },
  });
  await deps.updateRun(callRunId, patch);
  await deps.recordEvent({
    callRunId,
    kind: "finalised",
    detail: {
      dispatch_mode: "dry_run",
      fixture: selectedFixture,
      outbound_request_made: false,
      state: patch.state,
      failure_reason: patch.calle_failure?.failure_message ?? "",
    },
  });

  return { fixture, requestBody: exactBody, patch };
}

const testFn = (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void }).test;
if (typeof testFn === "function") {
  testFn("dry mode defaults on and a run can force it after global opt-in", () => {
    if (!isDryRun(false, () => undefined)) throw new Error("dry mode must default on");
    if (isDryRun(false, () => "false")) throw new Error("explicit global live mode was ignored");
    if (!isDryRun(true, () => "false")) throw new Error("per-run dry mode was ignored");
    try {
      isDryRun(false, () => "yes");
      throw new Error("invalid dry mode value was accepted");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ORMA_DRY_RUN must be true or false") throw error;
    }
  });

  testFn("dry dispatch records the byte-exact body and makes no outbound request", async () => {
    const { completed: completedFixture } = await loadCallFixtures();
    const body = '{"task":"hello","recipients":[{"phones":["+91XXXXXXXXXX"]}]}';
    const events: DryRunEvent[] = [];
    let patch: DryRunTerminalPatch | undefined;
    const result = await executeDryRun("run-1", body, completedFixture, {
      recordEvent: async (event) => { events.push(event); },
      updateRun: async (_runId, nextPatch) => { patch = nextPatch; },
      now: () => new Date("2026-09-12T00:00:00.000Z"),
    });
    if (result.requestBody !== body) throw new Error("dry mode rewrote the live request body");
    if (events[0]?.detail.request_body !== body) throw new Error("recorded request body differs from live body");
    if (events.some((event) => event.detail.outbound_request_made !== false)) throw new Error("dry mode reported an outbound request");
    if (patch?.state !== "completed" || patch.billable !== false || patch.calle_call_id !== `fixture:${completedFixture.id}`) {
      throw new Error("recorded completed fixture state was not persisted");
    }
  });

  testFn("dry dispatch rejects invalid bodies before writing a run event", async () => {
    const { completed: completedFixture } = await loadCallFixtures();
    let wrote = false;
    await executeDryRun("run-1", "not-json", completedFixture, {
      recordEvent: async () => { wrote = true; },
      updateRun: async () => { wrote = true; },
      now: () => new Date(),
    }).then(() => { throw new Error("invalid body was accepted"); }, (error) => {
      if (!(error instanceof Error) || error.message !== "dry-run request body must be valid JSON") throw error;
    });
    if (wrote) throw new Error("invalid body wrote a partial dry run");
  });

  testFn("dry dispatch can synthesize the recorded failed terminal fixture", async () => {
    const { failed } = await loadCallFixtures();
    const events: DryRunEvent[] = [];
    let patch: DryRunTerminalPatch | undefined;
    await executeDryRun("run-1", "{}", failed, {
      recordEvent: async (event) => { events.push(event); },
      updateRun: async (_runId, nextPatch) => { patch = nextPatch; },
      now: () => new Date("2026-09-12T00:00:00.000Z"),
    });
    if (patch?.state !== "failed" || patch.disposition !== "not_answered") {
      throw new Error("failed fixture did not produce a failed, non-billable run");
    }
    if (events[1]?.detail.failure_reason !== failed.failure_message) {
      throw new Error("failed dry-run timeline lost the recorded terminal reason");
    }
  });
}
