/**
 * T2.7 result ingestion.
 *
 * A terminal call becomes rows in one PostgreSQL transaction. PostgREST cannot
 * hold that transaction, so this module validates the extraction, forwards it
 * to `public.ingest_call_result`, and records the `ingested` timeline row.
 * A null or invalid result still writes the transcript and a disposition, so
 * the user never learns that extraction failed.
 *
 * "Invalid" covers more than `parseStructuredResult`. The RPC casts and checks
 * several fields, and a raise there rolls the whole ingest back. The CALL-E
 * payload never changes, so such a result would fail on every retry. This
 * module therefore stays stricter than the SQL on its own. Anything the RPC
 * would reject becomes `valid=false` before the request leaves.
 *
 * A `slot_change_requested` is a proposal only. This module returns it and
 * never writes `slots`.
 */

import { recordCallEvent } from "./events.ts";
import { loadCallFixtures, type TranscriptTurnFixture } from "./fixtures.ts";
import { parseStructuredResult, type StructuredCallResult } from "./result.ts";

export type TerminalCallSource = {
  callRunId: string;
  userId: string;
  raw: unknown;
  transcriptTurns: TranscriptTurnFixture[];
  structuredResult: unknown | null;
};

export type IngestCounts = {
  items: number;
  mentions: number;
  retirements: number;
  commitments: number;
};

export type IngestResult = {
  alreadyIngested: boolean;
  disposition: string;
  counts: IngestCounts;
  slotChangeRequested: string | null;
};

export type IngestDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  fetch: typeof fetch;
};

type TerminalState = "completed" | "failed" | "canceled";
type Disposition = "answered_extracted" | "answered_no_result" | "not_answered" | "canceled";

type IngestSummary = {
  already_ingested: boolean;
  disposition: string;
  counts: IngestCounts;
  slot_change_requested: string | null;
};

// PostgreSQL's uuid input also takes braces and unhyphenated forms. The task
// hands ids out in canonical form, so accepting only that is strictly safer.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;
// A strict subset of what `::timestamptz` accepts. Each accepted boundary form
// is proven against PostgreSQL by case six of test-ingest.sh.
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-](\d{2}):?(\d{2}))?)?$/;

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") throw new Error(message);
  return value;
}

function requireCount(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function requireTurns(value: unknown): TranscriptTurnFixture[] {
  if (!Array.isArray(value)) throw new Error("ingest requires transcript turns");
  return value.map((turn, index) => {
    const record = requireObject(turn, `transcript turn ${index} must be an object`);
    const offset = record.offset_seconds;
    if (typeof offset !== "number" || !Number.isInteger(offset)) {
      throw new Error(`transcript turn ${index} requires an integer offset`);
    }
    return {
      offset_seconds: offset,
      speaker: requireString(record.speaker, `transcript turn ${index} requires a speaker`),
      text: requireString(record.text, `transcript turn ${index} requires text`),
    };
  });
}

function terminalState(raw: Record<string, unknown>): TerminalState {
  const status = raw.status;
  if (status === "completed" || status === "failed" || status === "canceled") return status;
  throw new Error("ingest requires a terminal call status");
}

function dispositionFor(state: TerminalState, valid: boolean): Disposition {
  if (state === "canceled") return "canceled";
  if (state === "failed") return "not_answered";
  return valid ? "answered_extracted" : "answered_no_result";
}

function apiBase(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  if (base.includes("supabase.co")) throw new Error("must use ORMA_API_URL, not project host");
  return base;
}

function readHeaders(serviceRoleKey: string): HeadersInit {
  return { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };
}

// jsonb refuses U+0000 and any unpaired UTF-16 surrogate. PostgREST fails the
// whole request when one reaches a jsonb argument.
function isStorableText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isStorableTimestamp(value: string): boolean {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;
  const y = Number(year);
  const m = Number(month);
  if (y < 1 || m < 1 || m > 12) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (Number(day) < 1 || Number(day) > days) return false;
  if (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59)) return false;
  if (second !== undefined && Number(second) > 59) return false;
  if (offsetHour !== undefined && (Number(offsetHour) > 15 || Number(offsetMinute) > 59)) return false;
  return true;
}

function offsetRejection(value: number, path: string): string | null {
  return value < INT4_MIN || value > INT4_MAX ? `${path} is outside the integer range` : null;
}

function itemIdRejection(value: string, path: string): string | null {
  return UUID_PATTERN.test(value) ? null : `${path} must be a UUID`;
}

/**
 * Mirrors every cast and raise in `ingest_call_result` that depends on the
 * result alone. Reasons name the path, never the value, because a value may
 * hold a spoken phone number.
 */
function storageRejection(result: StructuredCallResult): string | null {
  for (const [index, item] of result.captured_items.entries()) {
    const path = `structured_result.captured_items[${index}]`;
    if (item.text.trim() === "") return `${path}.text must not be blank`;
    if (!isStorableText(item.text)) return `${path}.text holds characters PostgreSQL cannot store`;
    const offset = offsetRejection(item.evidence_offset_seconds, `${path}.evidence_offset_seconds`);
    if (offset) return offset;
  }
  for (const [index, item] of result.retired_items.entries()) {
    const path = `structured_result.retired_items[${index}]`;
    const rejection = itemIdRejection(item.item_id, `${path}.item_id`) ??
      offsetRejection(item.evidence_offset_seconds, `${path}.evidence_offset_seconds`);
    if (rejection) return rejection;
  }
  for (const [index, item] of (result.commitments ?? []).entries()) {
    const path = `structured_result.commitments[${index}]`;
    const rejection = itemIdRejection(item.item_id, `${path}.item_id`) ??
      offsetRejection(item.evidence_offset_seconds, `${path}.evidence_offset_seconds`);
    if (rejection) return rejection;
    if (item.due !== undefined && !isStorableTimestamp(item.due)) {
      return `${path}.due must be an ISO 8601 date or timestamp`;
    }
  }
  if (result.slot_change_time !== undefined && !isStorableText(result.slot_change_time)) {
    return "structured_result.slot_change_time holds characters PostgreSQL cannot store";
  }
  return null;
}

/**
 * The RPC raises when a retirement or a commitment names an item the user does
 * not own. A model can invent a well-formed id, so this read turns that into an
 * invalid result. If an item vanishes between this read and the RPC, the RPC
 * raises and the caller retries. The retry's read then rejects the result.
 */
async function ownershipRejection(
  result: StructuredCallResult,
  userId: string,
  deps: IngestDeps,
): Promise<string | null> {
  const references = [
    ...result.retired_items.map((item, index) => ({
      id: item.item_id.toLowerCase(),
      path: `structured_result.retired_items[${index}].item_id`,
    })),
    ...(result.commitments ?? []).map((item, index) => ({
      id: item.item_id.toLowerCase(),
      path: `structured_result.commitments[${index}].item_id`,
    })),
  ];
  if (references.length === 0) return null;

  const ids = [...new Set(references.map((reference) => reference.id))];
  const query = new URLSearchParams({
    select: "id",
    user_id: `eq.${userId}`,
    id: `in.(${ids.join(",")})`,
  });
  const response = await deps.fetch(`${apiBase(deps.apiUrl)}/rest/v1/items?${query}`, {
    method: "GET",
    headers: readHeaders(deps.serviceRoleKey),
  });
  if (!response.ok) {
    throw new Error(`item ownership lookup failed: ${await failureCause(response, deps.serviceRoleKey)}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("item ownership lookup returned no rows");
  const owned = new Set(
    rows.map((row) => typeof row?.id === "string" ? row.id.toLowerCase() : ""),
  );
  const missing = references.find((reference) => !owned.has(reference.id));
  return missing ? `${missing.path} does not name an item this user owns` : null;
}

const MASKABLE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+)?|\+?\d[\d ().-]{5,}\d/gi;

/** Removes keys and masks phone-shaped digit runs. UUIDs and dates survive. */
function scrub(text: string, serviceRoleKey: string): string {
  let clean = serviceRoleKey ? text.split(serviceRoleKey).join("[redacted key]") : text;
  clean = clean
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted key]")
    .replace(/sb_(?:secret|publishable)_[\w-]+/g, "[redacted key]");
  return clean.replace(MASKABLE, (match) => {
    if (UUID_PATTERN.test(match) || /^\d{4}-\d{2}-\d{2}/.test(match)) return match;
    return match.replace(/\D/g, "").length >= 7 ? "[masked number]" : match;
  });
}

/** Names the PostgREST cause of a failed request, safe to log or throw. */
async function failureCause(response: Response, serviceRoleKey: string): Promise<string> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  let parts = [body.trim()];
  try {
    const parsed = JSON.parse(body);
    if (parsed !== null && typeof parsed === "object") {
      parts = [parsed.code, parsed.message, parsed.details, parsed.hint];
    }
  } catch {
    // A non-JSON body is kept as text.
  }
  // Each part is scrubbed alone, so digits from two fields never join into
  // one phone-shaped run. The status is ours and needs no scrubbing.
  const detail = parts
    .filter((part): part is string => typeof part === "string" && part !== "")
    .map((part) => scrub(part, serviceRoleKey))
    .join(" ");
  return (detail ? `HTTP ${response.status} ${detail}` : `HTTP ${response.status}`).slice(0, 500);
}

function readSummary(value: unknown): IngestSummary {
  const record = requireObject(value, "ingest returned no summary");
  const counts = requireObject(record.counts, "ingest summary requires counts");
  return {
    already_ingested: requireBoolean(record.already_ingested, "ingest summary requires an already_ingested flag"),
    disposition: requireString(record.disposition, "ingest summary requires a disposition"),
    counts: {
      items: requireCount(counts.items, "ingest summary requires an item count"),
      mentions: requireCount(counts.mentions, "ingest summary requires a mention count"),
      retirements: requireCount(counts.retirements, "ingest summary requires a retirement count"),
      commitments: requireCount(counts.commitments, "ingest summary requires a commitment count"),
    },
    slot_change_requested: typeof record.slot_change_requested === "string"
      ? record.slot_change_requested
      : null,
  };
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * The first ingest writes its `ingested` row after the transaction commits. A
 * failure in that window leaves the run ingested with no timeline row. A retry
 * lands here and writes the missing row from the committed rows.
 */
async function backfillIngestedEvent(
  runId: string,
  calleCallId: string | null,
  deps: IngestDeps,
): Promise<void> {
  const query = new URLSearchParams({
    id: `eq.${runId}`,
    select: "state,disposition,results(structured),item_mentions(id),commitments(id),call_events(id)",
    "call_events.kind": "eq.ingested",
  });
  const response = await deps.fetch(`${apiBase(deps.apiUrl)}/rest/v1/call_runs?${query}`, {
    method: "GET",
    headers: readHeaders(deps.serviceRoleKey),
  });
  if (!response.ok) {
    throw new Error(`ingested event lookup failed: ${await failureCause(response, deps.serviceRoleKey)}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ingested event lookup found no run");
  const run = requireObject(rows[0], "ingested event lookup found no run");
  if (arrayLength(run.call_events) > 0) return;

  const results = run.results !== null && typeof run.results === "object"
    ? run.results as Record<string, unknown>
    : {};
  const structured = results.structured !== null && typeof results.structured === "object"
    ? results.structured as Record<string, unknown>
    : {};
  // The RPC inserts one item per captured entry and retires one per retired
  // entry, or raises. The committed arrays therefore equal those counts.
  await recordCallEvent(runId, "ingested", {
    call_run_id: runId,
    calle_call_id: calleCallId,
    state: typeof run.state === "string" ? run.state : null,
    disposition: typeof run.disposition === "string" ? run.disposition : null,
    item_count: arrayLength(structured.captured_items),
    mention_count: arrayLength(run.item_mentions),
    retirement_count: arrayLength(structured.retired_items),
    commitment_count: arrayLength(run.commitments),
    backfilled: true,
  }, deps);
}

export function depsFromEnv(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
  fetchImpl: typeof fetch = fetch,
): IngestDeps {
  const apiUrl = getEnv("ORMA_API_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiUrl) throw new Error("missing ORMA_API_URL");
  if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  return { apiUrl, serviceRoleKey, fetch: fetchImpl };
}

/**
 * Ingests one terminal call. The caller supplies the authoritative payload
 * plus the transcript turns and structured result it extracted from that
 * payload, so this module never dials CALL-E. Environment is reached only
 * through `ORMA_API_URL`.
 */
export async function ingestTerminalRun(
  source: TerminalCallSource,
  deps: IngestDeps,
): Promise<IngestResult> {
  const input = requireObject(source, "ingest requires a terminal call source");
  const runId = requireString(input.callRunId, "ingest requires a call run id");
  const userId = requireString(input.userId, "ingest requires a user id");
  const raw = requireObject(input.raw, "ingest requires a terminal call payload");
  const turns = requireTurns(input.transcriptTurns);
  const state = terminalState(raw);

  const parsed = parseStructuredResult(input.structuredResult ?? null);
  let structured = parsed.result;
  let reason = parsed.reason;
  if (structured !== null) {
    const rejection = storageRejection(structured) ??
      await ownershipRejection(structured, userId, deps);
    if (rejection !== null) {
      structured = null;
      reason = rejection;
    }
  }
  const valid = structured !== null;
  const disposition = dispositionFor(state, valid);

  // The RPC casts this to timestamptz. An unparseable provider timestamp falls
  // back to the RPC's now() instead of failing the ingest forever.
  const completedAt = typeof raw.completed_at === "string" && isStorableTimestamp(raw.completed_at)
    ? raw.completed_at
    : null;
  const calleCallId = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : null;

  const response = await deps.fetch(`${apiBase(deps.apiUrl)}/rest/v1/rpc/ingest_call_result`, {
    method: "POST",
    headers: {
      ...readHeaders(deps.serviceRoleKey),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_call_run_id: runId,
      p_user_id: userId,
      p_transcript_turns: turns,
      p_raw: raw,
      p_structured: structured,
      p_result_valid: valid,
      p_result_error: reason,
      p_state: state,
      p_disposition: disposition,
      p_mood: structured?.mood ?? null,
      p_completed_at: completedAt,
    }),
  });
  if (!response.ok) {
    throw new Error(`call result ingestion failed: ${await failureCause(response, deps.serviceRoleKey)}`);
  }

  const summary = readSummary(await response.json());

  if (summary.already_ingested) {
    await backfillIngestedEvent(runId, calleCallId, deps);
  } else {
    await recordCallEvent(runId, "ingested", {
      call_run_id: runId,
      calle_call_id: calleCallId,
      state,
      disposition: summary.disposition,
      item_count: summary.counts.items,
      mention_count: summary.counts.mentions,
      retirement_count: summary.counts.retirements,
      commitment_count: summary.counts.commitments,
    }, deps);
  }

  return {
    alreadyIngested: summary.already_ingested,
    disposition: summary.disposition,
    counts: summary.counts,
    slotChangeRequested: summary.slot_change_requested,
  };
}

const testFn =
  (Deno as { test?: (name: string, fn: () => void | Promise<void>) => void })
    .test;

if (typeof testFn === "function") {
  const baseUrl = "https://orma-api.nryn.dev";
  const runId = "11111111-1111-4111-8111-111111111111";
  const userId = "33333333-3333-4333-8333-333333333333";
  const itemId = "22222222-2222-4222-8222-222222222222";
  const zeroCounts: IngestCounts = { items: 0, mentions: 0, retirements: 0, commitments: 0 };

  const deps = (fetchImpl: typeof fetch): IngestDeps => ({
    apiUrl: baseUrl,
    serviceRoleKey: "service-key",
    fetch: fetchImpl,
  });

  type MockState = {
    rpcBodies: Record<string, unknown>[];
    events: Record<string, unknown>[];
    summary: () => IngestSummary;
    ownedItems?: string[];
    itemLookups?: URL[];
    rpcFailure?: () => Response | null;
    eventFailure?: () => boolean;
    runRow?: (events: Record<string, unknown>[]) => Record<string, unknown>;
    runLookups?: URL[];
  };

  // Every mock branches on URL and method. Anything else throws, so a stray
  // request fails the test instead of passing silently.
  const mock = (state: MockState): typeof fetch =>
  (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/rest/v1/rpc/ingest_call_result") {
      if (request.method !== "POST") throw new Error(`unexpected ${request.method} ${request.url}`);
      return request.json().then((body) => {
        state.rpcBodies.push(body as Record<string, unknown>);
        return state.rpcFailure?.() ?? Response.json(state.summary());
      });
    }
    if (url.pathname === "/rest/v1/items") {
      if (request.method !== "GET" || !state.ownedItems) throw new Error(`unexpected ${request.method} ${request.url}`);
      state.itemLookups?.push(url);
      return Promise.resolve(Response.json(state.ownedItems.map((id) => ({ id }))));
    }
    if (url.pathname === "/rest/v1/call_runs") {
      if (request.method !== "GET" || !state.runRow) throw new Error(`unexpected ${request.method} ${request.url}`);
      state.runLookups?.push(url);
      return Promise.resolve(Response.json([state.runRow(state.events)]));
    }
    if (url.pathname === "/rest/v1/call_events") {
      if (request.method !== "POST") throw new Error(`unexpected ${request.method} ${request.url}`);
      return request.json().then((row) => {
        if (state.eventFailure?.()) return new Response("{}", { status: 503 });
        state.events.push(row as Record<string, unknown>);
        return new Response(null, { status: 201 });
      });
    }
    throw new Error(`unexpected request ${request.method} ${request.url}`);
  };

  const ingestedEvents = (events: Record<string, unknown>[]) =>
    events.filter((event) => event.kind === "ingested").map((_, index) => ({ id: index + 1 }));

  testFn("the completed fixture produces items, mentions, retirements and commitments", async () => {
    const { completed } = await loadCallFixtures();
    const attempt = completed.recipients[0].attempts[0];
    // The recorded call retired nothing and promised nothing. This test adds
    // one of each so those branches still run against the recorded payload.
    const structuredResult = {
      ...(completed.structured_result as Record<string, unknown>),
      retired_items: [{ item_id: itemId, evidence_offset_seconds: 62 }],
      commitments: [{ item_id: itemId, due: "2026-09-12T03:00:00.000Z", evidence_offset_seconds: 80 }],
    };
    const state: MockState = {
      rpcBodies: [],
      events: [],
      ownedItems: [itemId],
      itemLookups: [],
      summary: () => ({
        already_ingested: false,
        disposition: "answered_extracted",
        counts: { items: 1, mentions: 3, retirements: 1, commitments: 1 },
        slot_change_requested: "no",
      }),
    };

    const result = await ingestTerminalRun({
      callRunId: runId,
      userId,
      raw: completed,
      transcriptTurns: attempt.transcript_turns,
      structuredResult,
    }, deps(mock(state)));

    if (state.itemLookups?.length !== 1) throw new Error("the referenced item ids must be checked once");
    const lookup = state.itemLookups[0].searchParams;
    if (lookup.get("user_id") !== `eq.${userId}` || lookup.get("id") !== `in.(${itemId})`) {
      throw new Error("the ownership lookup must filter by user and item");
    }
    if (state.rpcBodies.length !== 1) throw new Error("the completed fixture must ingest through one RPC");
    const body = state.rpcBodies[0];
    if (body.p_call_run_id !== runId || body.p_user_id !== userId) {
      throw new Error("the RPC lost the run or the user");
    }
    if (body.p_state !== "completed" || body.p_disposition !== "answered_extracted") {
      throw new Error("the completed call did not become an answered extraction");
    }
    if (body.p_result_valid !== true || body.p_result_error !== null || body.p_mood !== "unknown") {
      throw new Error("the valid result was not forwarded intact");
    }
    if (body.p_completed_at !== completed.completed_at) {
      throw new Error("a well-formed completed_at must be forwarded");
    }
    if (JSON.stringify(body.p_raw) !== JSON.stringify(completed)) {
      throw new Error("the raw provider payload was not preserved");
    }
    if (JSON.stringify(body.p_transcript_turns) !== JSON.stringify(attempt.transcript_turns)) {
      throw new Error("the transcript turns were not preserved");
    }
    const structured = body.p_structured as Record<string, unknown>;
    if (JSON.stringify(structured.captured_items) !== JSON.stringify([{ text: "Continental", evidence_offset_seconds: 44 }])) {
      throw new Error("the captured item did not survive extraction");
    }
    const retired = structured.retired_items as Record<string, unknown>[];
    const commitments = structured.commitments as Record<string, unknown>[];
    if (retired[0]?.evidence_offset_seconds !== 62 || commitments[0]?.due !== "2026-09-12T03:00:00.000Z") {
      throw new Error("the retirement or commitment lost its evidence");
    }

    if (result.alreadyIngested !== false || result.disposition !== "answered_extracted") {
      throw new Error("the RPC summary was not surfaced");
    }
    if (result.counts.items !== 1 || result.counts.mentions !== 3 || result.counts.retirements !== 1 || result.counts.commitments !== 1) {
      throw new Error("the RPC counts were not surfaced");
    }
    if (result.slotChangeRequested !== "no") throw new Error("the slot proposal was not surfaced");

    if (state.events.length !== 1) throw new Error("ingest must record exactly one timeline row");
    const event = state.events[0];
    if (event.kind !== "ingested" || event.call_run_id !== runId) {
      throw new Error("the timeline row lost its run or its kind");
    }
    const detail = event.detail as Record<string, unknown>;
    if (detail.state !== "completed" || detail.calle_call_id !== completed.id) {
      throw new Error("the timeline row must name the call and its state");
    }
    if (detail.item_count !== 1 || detail.mention_count !== 3 || detail.retirement_count !== 1 || detail.commitment_count !== 1) {
      throw new Error("the timeline row must carry the counts");
    }
  });

  testFn("the invalid fixture writes a transcript and a disposition with no partial state", async () => {
    const raw = await Deno.readTextFile(
      new URL("../../../testdata/calle/webhook-result-validation-failed.documented.json", import.meta.url),
    );
    const fixture = JSON.parse(raw) as { body: { id: string; data: { id: string } } };
    const state: MockState = {
      rpcBodies: [],
      events: [],
      summary: () => ({
        already_ingested: false,
        disposition: "answered_no_result",
        counts: zeroCounts,
        slot_change_requested: null,
      }),
    };

    const result = await ingestTerminalRun({
      callRunId: runId,
      userId,
      raw: {
        id: fixture.body.data.id,
        status: "completed",
        structured_result: null,
        completed_at: "2026-09-13T12:00:30.000Z",
      },
      transcriptTurns: [],
      structuredResult: fixture.body,
    }, deps(mock(state)));

    if (state.rpcBodies.length !== 1) throw new Error("the invalid fixture must still reach the RPC");
    const body = state.rpcBodies[0];
    if (body.p_structured !== null || body.p_result_valid !== false) {
      throw new Error("an invalid result must not be persisted as structured");
    }
    if (typeof body.p_result_error !== "string" || body.p_result_error.length === 0) {
      throw new Error("an invalid result must carry its failure reason");
    }
    if (body.p_disposition !== "answered_no_result" || body.p_state !== "completed") {
      throw new Error("an answered call with no result must be answered_no_result");
    }
    if (JSON.stringify(body.p_transcript_turns) !== "[]") {
      throw new Error("the transcript must still be written on an invalid result");
    }
    if (result.disposition !== "answered_no_result" || result.counts.items !== 0 || result.counts.mentions !== 0) {
      throw new Error("an invalid result must leave no partial state");
    }
    if (state.events.length !== 1 || (state.events[0].detail as Record<string, unknown>).disposition !== "answered_no_result") {
      throw new Error("the timeline must record the answered_no_result disposition");
    }
  });

  testFn("a retirement without an evidence offset is rejected", async () => {
    const state: MockState = {
      rpcBodies: [],
      events: [],
      summary: () => ({
        already_ingested: false,
        disposition: "answered_no_result",
        counts: zeroCounts,
        slot_change_requested: null,
      }),
    };

    const result = await ingestTerminalRun({
      callRunId: runId,
      userId,
      raw: { id: "call_unoffset_retirement", status: "completed" },
      transcriptTurns: [],
      structuredResult: { captured_items: [], retired_items: [{ item_id: itemId }] },
    }, deps(mock(state)));

    if (state.rpcBodies.length !== 1) throw new Error("the rejected result must reach the RPC as invalid");
    const body = state.rpcBodies[0];
    if (body.p_structured !== null || body.p_result_valid !== false) {
      throw new Error("a retirement without an evidence offset must be rejected, never written");
    }
    if (typeof body.p_result_error !== "string" || body.p_result_error.length === 0) {
      throw new Error("the rejected retirement must carry a reason");
    }
    if (result.disposition !== "answered_no_result") {
      throw new Error("a rejected extraction must fall back to answered_no_result");
    }
  });

  // Each case parses cleanly but would make `ingest_call_result` raise. The
  // matching SQL raise is proven by case seven of test-ingest.sh.
  const sqlRejected: { name: string; result: Record<string, unknown>; owned?: string[]; reason: string }[] = [
    {
      name: "a free-text due",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, due: "next Tuesday after work", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].due must be an ISO 8601 date or timestamp",
    },
    {
      name: "a year-only due",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, due: "2026", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].due must be an ISO 8601 date or timestamp",
    },
    {
      name: "an empty due",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, due: "", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].due must be an ISO 8601 date or timestamp",
    },
    {
      name: "an impossible calendar due",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, due: "2026-02-30T10:00:00Z", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].due must be an ISO 8601 date or timestamp",
    },
    {
      name: "a due in year zero",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, due: "0000-09-15T10:00:00Z", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].due must be an ISO 8601 date or timestamp",
    },
    {
      name: "a due with an out-of-range zone",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, due: "2026-09-15T10:00:00+16:00", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].due must be an ISO 8601 date or timestamp",
    },
    {
      name: "a paraphrased retired item id",
      result: { captured_items: [], retired_items: [{ item_id: "the museum one", evidence_offset_seconds: 62 }] },
      reason: "structured_result.retired_items[0].item_id must be a UUID",
    },
    {
      name: "a paraphrased commitment item id",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: "passport", evidence_offset_seconds: 80 }] },
      reason: "structured_result.commitments[0].item_id must be a UUID",
    },
    {
      name: "a blank captured text",
      result: { captured_items: [{ text: "   ", evidence_offset_seconds: 44 }], retired_items: [] },
      reason: "structured_result.captured_items[0].text must not be blank",
    },
    {
      name: "an empty captured text",
      result: { captured_items: [{ text: "", evidence_offset_seconds: 44 }], retired_items: [] },
      reason: "structured_result.captured_items[0].text must not be blank",
    },
    {
      name: "a captured text holding U+0000",
      result: { captured_items: [{ text: "pass\u0000port", evidence_offset_seconds: 44 }], retired_items: [] },
      reason: "structured_result.captured_items[0].text holds characters PostgreSQL cannot store",
    },
    {
      name: "a captured text holding a lone surrogate",
      result: { captured_items: [{ text: "pass\ud800port", evidence_offset_seconds: 44 }], retired_items: [] },
      reason: "structured_result.captured_items[0].text holds characters PostgreSQL cannot store",
    },
    {
      name: "a slot change time holding U+0000",
      result: { captured_items: [], retired_items: [], slot_change_requested: "yes", slot_change_time: "7\u0000am" },
      reason: "structured_result.slot_change_time holds characters PostgreSQL cannot store",
    },
    {
      name: "a captured offset above the integer range",
      result: { captured_items: [{ text: "Continental", evidence_offset_seconds: 2147483648 }], retired_items: [] },
      reason: "structured_result.captured_items[0].evidence_offset_seconds is outside the integer range",
    },
    {
      name: "a retired offset written as 1e21",
      result: { captured_items: [], retired_items: [{ item_id: itemId, evidence_offset_seconds: 1e21 }] },
      reason: "structured_result.retired_items[0].evidence_offset_seconds is outside the integer range",
    },
    {
      name: "a commitment offset below the integer range",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: itemId, evidence_offset_seconds: -2147483649 }] },
      reason: "structured_result.commitments[0].evidence_offset_seconds is outside the integer range",
    },
    {
      name: "a retirement of an item the user does not own",
      result: { captured_items: [], retired_items: [{ item_id: itemId, evidence_offset_seconds: 62 }] },
      owned: [],
      reason: "structured_result.retired_items[0].item_id does not name an item this user owns",
    },
    {
      name: "a commitment on an item the user does not own",
      result: { captured_items: [], retired_items: [], commitments: [{ item_id: "44444444-4444-4444-8444-444444444444", evidence_offset_seconds: 80 }] },
      owned: [itemId],
      reason: "structured_result.commitments[0].item_id does not name an item this user owns",
    },
  ];

  testFn("a parsed result the RPC would reject becomes answered_no_result", async () => {
    for (const testCase of sqlRejected) {
      if (parseStructuredResult(testCase.result).result === null) {
        throw new Error(`${testCase.name} must pass the parser, or the case proves nothing`);
      }
      const state: MockState = {
        rpcBodies: [],
        events: [],
        ownedItems: testCase.owned ?? [itemId],
        summary: () => ({
          already_ingested: false,
          disposition: "answered_no_result",
          counts: zeroCounts,
          slot_change_requested: null,
        }),
      };
      await ingestTerminalRun({
        callRunId: runId,
        userId,
        raw: { id: "call_sql_rejected", status: "completed" },
        transcriptTurns: [{ offset_seconds: 0, speaker: "agent", text: "Hello" }],
        structuredResult: testCase.result,
      }, deps(mock(state)));

      const body = state.rpcBodies[0];
      if (body?.p_structured !== null || body.p_result_valid !== false || body.p_mood !== null) {
        throw new Error(`${testCase.name} reached the RPC as a valid result`);
      }
      if (body.p_result_error !== testCase.reason) {
        throw new Error(`${testCase.name} gave reason ${String(body.p_result_error)}`);
      }
      if (body.p_disposition !== "answered_no_result" || JSON.stringify(body.p_transcript_turns).length < 3) {
        throw new Error(`${testCase.name} lost its disposition or its transcript`);
      }
    }
  });

  testFn("boundary values that PostgreSQL accepts stay valid", async () => {
    // The same values commit in case six of test-ingest.sh.
    const upper = itemId.toUpperCase();
    const dues = [
      "2026-09-15",
      "2026-09-15T10:00Z",
      "2026-09-15 10:00:00.123456+15:59",
      "2028-02-29T23:59:59-0530",
      "0001-01-01T00:00:00Z",
    ];
    const state: MockState = {
      rpcBodies: [],
      events: [],
      ownedItems: [itemId],
      summary: () => ({
        already_ingested: false,
        disposition: "answered_extracted",
        counts: zeroCounts,
        slot_change_requested: null,
      }),
    };
    await ingestTerminalRun({
      callRunId: runId,
      userId,
      raw: { id: "call_boundary", status: "completed", completed_at: "sometime after lunch" },
      transcriptTurns: [],
      structuredResult: {
        captured_items: [
          { text: " x", evidence_offset_seconds: -2147483648 },
          { text: "café 😀", evidence_offset_seconds: 2147483647 },
        ],
        retired_items: [{ item_id: upper, evidence_offset_seconds: 0 }],
        commitments: dues.map((due) => ({ item_id: itemId, due, evidence_offset_seconds: 1 })),
      },
    }, deps(mock(state)));
    const body = state.rpcBodies[0];
    if (body.p_result_valid !== true || body.p_result_error !== null) {
      throw new Error(`a PostgreSQL-storable result was rejected: ${String(body.p_result_error)}`);
    }
    if (body.p_completed_at !== null) {
      throw new Error("an unparseable completed_at must fall back to null, never reach the cast");
    }
  });

  testFn("re-ingesting the same run twice changes nothing", async () => {
    const { completed } = await loadCallFixtures();
    const attempt = completed.recipients[0].attempts[0];
    let ingests = 0;
    const state: MockState = {
      rpcBodies: [],
      events: [],
      runRow: (events) => ({
        state: "completed",
        disposition: "answered_extracted",
        results: { structured: completed.structured_result },
        item_mentions: [{ id: 1 }],
        commitments: [],
        call_events: ingestedEvents(events),
      }),
      summary: () => ingests++ === 0
        ? {
          already_ingested: false,
          disposition: "answered_extracted",
          counts: { items: 1, mentions: 1, retirements: 0, commitments: 0 },
          slot_change_requested: "no",
        }
        : {
          already_ingested: true,
          disposition: "answered_extracted",
          counts: zeroCounts,
          slot_change_requested: "no",
        },
    };
    const source: TerminalCallSource = {
      callRunId: runId,
      userId,
      raw: completed,
      transcriptTurns: attempt.transcript_turns,
      structuredResult: completed.structured_result,
    };

    const first = await ingestTerminalRun(source, deps(mock(state)));
    const second = await ingestTerminalRun(source, deps(mock(state)));

    if (state.rpcBodies.length !== 2) throw new Error("both ingests must still check the transaction in SQL");
    if (first.alreadyIngested !== false || second.alreadyIngested !== true) {
      throw new Error("the second ingest must be marked already_ingested");
    }
    if (second.counts.items !== 0 || second.counts.mentions !== 0 || second.counts.commitments !== 0) {
      throw new Error("a re-ingest must not report new rows");
    }
    if (state.events.length !== 1) {
      throw new Error("a re-ingest must not append a second ingested timeline row");
    }
  });

  testFn("a retry backfills an ingested row lost after commit, exactly once", async () => {
    let ingests = 0;
    let eventPosts = 0;
    const state: MockState = {
      rpcBodies: [],
      events: [],
      runLookups: [],
      eventFailure: () => eventPosts++ === 0,
      runRow: (events) => ({
        state: "completed",
        disposition: "answered_extracted",
        results: {
          structured: {
            captured_items: [{ text: "Continental", evidence_offset_seconds: 44 }],
            retired_items: [{ item_id: itemId, evidence_offset_seconds: 62 }],
            commitments: [{ item_id: itemId, evidence_offset_seconds: 80 }],
          },
        },
        item_mentions: [{ id: 1 }, { id: 2 }, { id: 3 }],
        commitments: [{ id: "c1" }],
        call_events: ingestedEvents(events),
      }),
      summary: () => ingests++ === 0
        ? { already_ingested: false, disposition: "answered_extracted", counts: zeroCounts, slot_change_requested: null }
        : { already_ingested: true, disposition: "answered_extracted", counts: zeroCounts, slot_change_requested: null },
    };
    const source: TerminalCallSource = {
      callRunId: runId,
      userId,
      raw: { id: "call_lost_event", status: "completed" },
      transcriptTurns: [],
      structuredResult: null,
    };

    await ingestTerminalRun(source, deps(mock(state))).then(
      () => { throw new Error("a failed timeline write must surface to the caller"); },
      (error) => { if (!(error instanceof Error) || error.message !== "call event insert failed") throw error; },
    );
    if (state.events.length !== 0) throw new Error("the failing event write must leave no row");

    const retry = await ingestTerminalRun(source, deps(mock(state)));
    await ingestTerminalRun(source, deps(mock(state)));

    if (retry.alreadyIngested !== true) throw new Error("the retry must see the committed ingest");
    if ((state.events.length as number) !== 1) {
      throw new Error(`the retry must write exactly one ingested row, found ${state.events.length}`);
    }
    const lookup = state.runLookups?.[0]?.searchParams;
    if (lookup?.get("id") !== `eq.${runId}` || lookup.get("call_events.kind") !== "eq.ingested") {
      throw new Error("the backfill must look for this run's ingested row");
    }
    const event = state.events[0];
    const detail = event.detail as Record<string, unknown>;
    if (event.kind !== "ingested" || detail.backfilled !== true || detail.calle_call_id !== "call_lost_event") {
      throw new Error("the backfilled row must be marked and name the call");
    }
    if (detail.item_count !== 1 || detail.mention_count !== 3 || detail.retirement_count !== 1 || detail.commitment_count !== 1) {
      throw new Error("the backfilled row must carry the counts of the committed rows");
    }
  });

  testFn("an RPC failure names its cause without a phone number or a key", async () => {
    const key = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl";
    const state: MockState = {
      rpcBodies: [],
      events: [],
      summary: () => { throw new Error("the failed RPC must not be summarised"); },
      rpcFailure: () =>
        Response.json({
          code: "22007",
          message: `invalid input syntax for type uuid: "+1 415 555 0127" for call run ${runId}`,
          details: `key ${key} due 2026-09-12T03:00:00`,
          hint: null,
        }, { status: 400 }),
    };
    const message = await ingestTerminalRun({
      callRunId: runId,
      userId,
      raw: { id: "call_rpc_failure", status: "completed" },
      transcriptTurns: [],
      structuredResult: null,
    }, { apiUrl: baseUrl, serviceRoleKey: key, fetch: mock(state) }).then(
      () => { throw new Error("a failed RPC was accepted"); },
      (error: Error) => error.message,
    );
    for (const expected of ["call result ingestion failed", "HTTP 400", "22007", "invalid input syntax for type uuid", runId, "2026-09-12T03:00:00"]) {
      if (!message.includes(expected)) throw new Error(`the thrown cause lost ${expected}: ${message}`);
    }
    if (message.includes("555") || message.includes(key) || message.includes("eyJ")) {
      throw new Error(`the thrown cause leaked a number or a key: ${message}`);
    }
    if (!message.includes("[masked number]")) throw new Error("the phone number must be masked, not dropped");
  });

  testFn("rejects an unparseable source before any write", async () => {
    for (const [callRunId, user, expected] of [
      ["", userId, "call run id"],
      [runId, "", "user id"],
    ]) {
      let called = false;
      await ingestTerminalRun({
        callRunId,
        userId: user,
        raw: { status: "completed" },
        transcriptTurns: [],
        structuredResult: null,
      }, deps(() => {
        called = true;
        throw new Error("fetch must not run for an unparseable source");
      })).then(() => {
        throw new Error(`${expected} was accepted`);
      }, (error) => {
        if (!(error instanceof Error) || !error.message.includes(expected)) throw error;
      });
      if (called) throw new Error("an unparseable source reached the database");
    }
  });
}
