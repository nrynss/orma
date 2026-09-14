#!/usr/bin/env node
/**
 * Pins T6.1. Today renders in the profile's zone, never the browser's.
 * The next run skips canceled and terminal runs. Counts equal the rows given.
 */
// Run as if the browser sat in Los Angeles. svelte-check carries no Node types, so reach process loosely.
;(globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.TZ =
  "America/Los_Angeles"

import {
  addedLabel,
  durationSeconds,
  formatDayLabel,
  formatNextCall,
  formatOffset,
  isFirstRun,
  itemAgeDays,
  lastCallHeadline,
  lastCallSummary,
  liveSteps,
  mentionCounts,
  nextSlotInstant,
  openItemsView,
  pickLastCall,
  pickLiveRun,
  pickNextRun,
  type CommitmentRow,
  type ItemRow,
  type MentionRow,
  type RunMentionRow,
  type RunRow,
} from "./model.ts"
import { isCurrentNav } from "../ui/nav.ts"

function fail(message: string): never {
  throw new Error(message)
}

function eq<T>(actual: T, expected: T, what: string): void {
  if (actual !== expected) fail(`${what}: expected ${String(expected)}, saw ${String(actual)}`)
}

function run(id: string, state: string, scheduledFor: string, extra: Partial<RunRow> = {}): RunRow {
  return {
    id,
    state,
    disposition: null,
    mood: null,
    scheduled_for: scheduledFor,
    claimed_at: null,
    dispatched_at: null,
    completed_at: null,
    poll_after: null,
    ...extra,
  }
}

// 05:30 in Asia/Kolkata on Monday 14 September. 17:00 the day before in Los Angeles.
const NOW = new Date("2026-09-14T00:00:00.000Z")
const KOLKATA = "Asia/Kolkata"

// 1. The next run renders in the profile's zone, and a browser zone renders it differently.
eq(new Date().getTimezoneOffset() > 0, true, "the check runs under a browser zone west of UTC")
const nextAt = "2026-09-14T02:30:00.000Z"
const profileRender = formatNextCall(nextAt, KOLKATA, NOW)
eq(profileRender, "Today, 08:00", "next run in the profile zone")
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const browserRender = formatNextCall(nextAt, browserZone, NOW)
eq(browserRender, "Today, 19:30", "the same run in the browser zone")
if (profileRender === browserRender) fail("profile and browser zones rendered the same next run")
const naive = new Date(nextAt)
const naiveClock = `${String(naive.getHours()).padStart(2, "0")}:${String(naive.getMinutes()).padStart(2, "0")}`
if (profileRender.endsWith(naiveClock)) fail("next run followed the process zone")
eq(formatDayLabel(NOW, KOLKATA), "Monday 14 September", "date label in the profile zone")
eq(formatDayLabel(NOW, browserZone), "Sunday 13 September", "date label in the browser zone")
eq(formatNextCall("2026-09-15T02:30:00.000Z", KOLKATA, NOW), "Tomorrow, 08:00", "tomorrow in the profile zone")

// 2. The earliest future scheduled run wins. Canceled, terminal, live and past runs never do.
const runs: RunRow[] = [
  run("later-scheduled", "scheduled", "2026-09-15T02:30:00.000Z"),
  run("earlier-canceled", "canceled", "2026-09-14T00:30:00.000Z", { disposition: "canceled" }),
  run("earlier-completed", "completed", "2026-09-14T00:40:00.000Z", { disposition: "answered_extracted" }),
  run("earlier-failed", "failed", "2026-09-14T00:45:00.000Z", { disposition: "not_answered" }),
  run("earlier-claimed", "claimed", "2026-09-14T00:50:00.000Z"),
  run("past-scheduled", "scheduled", "2026-09-13T23:59:00.000Z"),
  run("next-scheduled", "scheduled", "2026-09-14T02:30:00.000Z"),
]
eq(pickNextRun(runs, NOW)?.id, "next-scheduled", "next run")
eq(pickNextRun(runs.filter((r) => r.id !== "next-scheduled" && r.id !== "later-scheduled"), NOW), null, "no future scheduled run")
eq(pickLiveRun(runs)?.id, "earlier-claimed", "live run")
eq(pickLastCall(runs)?.id, "earlier-failed", "last call skips canceled and scheduled runs")

// 3. First run means no call was ever placed or attempted.
eq(isFirstRun([]), true, "no runs is first run")
eq(isFirstRun([run("a", "scheduled", nextAt), run("b", "canceled", nextAt)]), true, "scheduled and canceled only is first run")
eq(isFirstRun([run("a", "completed", nextAt)]), false, "a completed run is not first run")
eq(isFirstRun([run("a", "failed", nextAt)]), false, "a failed run is not first run")
eq(isFirstRun([run("a", "awaiting_result", nextAt)]), false, "a live run is not first run")

// 4. Mention counts equal the rows given, and an item with none shows zero.
const items: ItemRow[] = [
  { id: "dentist", text: "Book a dentist appointment", status: "open", since_date: "2026-08-11", created_at: "2026-09-01T00:00:00.000Z", source: "web" },
  { id: "passport", text: "Renew the passport", status: "open", since_date: null, created_at: "2026-09-13T20:00:00.000Z", source: "telegram" },
  { id: "silent", text: "Water the plants", status: "open", since_date: null, created_at: "2026-09-10T00:00:00.000Z", source: "mcp" },
  { id: "gone", text: "Old thing", status: "retired", since_date: null, created_at: "2026-09-01T00:00:00.000Z", source: "web" },
]
const mentions: MentionRow[] = [
  { item_id: "dentist", call_run_id: "r1", offset_seconds: 0 },
  { item_id: "dentist", call_run_id: "r2", offset_seconds: 12 },
  { item_id: "dentist", call_run_id: null, offset_seconds: null },
  { item_id: "passport", call_run_id: "r2", offset_seconds: 30 },
  { item_id: "gone", call_run_id: "r2", offset_seconds: 40 },
]
const counts = mentionCounts(mentions)
for (const id of ["dentist", "passport", "gone"]) {
  eq(counts.get(id), mentions.filter((m) => m.item_id === id).length, `mention count for ${id}`)
}
eq(counts.get("silent"), undefined, "no rows gives no count")
const open = openItemsView(items, mentions, KOLKATA, NOW)
eq(open.length, 3, "open view keeps open items only")
eq(open[0].id, "dentist", "most mentioned first")
eq(open[0].mentions, 3, "dentist shows its three rows")
eq(open[0].meta, "3 mentions · 34 days", "dentist meta from since_date")
eq(open.find((i) => i.id === "silent")?.mentions, 0, "an item with no rows shows zero")
eq(open.find((i) => i.id === "silent")?.meta, "not mentioned yet · 4 days", "zero mention label")

// 5. Age reads local days in the profile zone. 20:00 UTC on 13 September is 01:30 on 14 September in Kolkata.
eq(itemAgeDays(items[1], KOLKATA, NOW), 0, "passport age in the profile zone")
eq(itemAgeDays(items[1], "UTC", new Date("2026-09-14T01:00:00.000Z")), 1, "passport age in UTC differs")
eq(open.find((i) => i.id === "passport")?.meta, "1 mention · added today", "passport meta")
eq(addedLabel({ source: "telegram", created_at: "2026-09-13T00:00:00.000Z" }, KOLKATA, NOW), "added on Telegram yesterday", "first-run provenance")

// 6. The last call summary reads rows on that run, and a commitment's own mention is not read twice.
const lastRun = run("r2", "completed", "2026-09-13T02:30:00.000Z", {
  dispatched_at: "2026-09-13T02:30:05.000Z",
  disposition: "answered_extracted",
  mood: "energised",
})
const runMentions: RunMentionRow[] = [
  { item_id: "dentist", call_run_id: "r2", offset_seconds: 8, items: { text: "Book a dentist appointment", status: "open", source: "web", created_at: "2026-09-01T00:00:00.000Z", retired_at: null } },
  { item_id: "gone", call_run_id: "r2", offset_seconds: 12, items: { text: "Old thing", status: "retired", source: "web", created_at: "2026-09-01T00:00:00.000Z", retired_at: "2026-09-13T02:32:00.000Z" } },
  { item_id: "car", call_run_id: "r2", offset_seconds: 33, items: { text: "Renew the car insurance", status: "open", source: "call", created_at: "2026-09-13T02:32:00.000Z", retired_at: null } },
  { item_id: "amma", call_run_id: "r2", offset_seconds: 4, items: { text: "Call Amma", status: "open", source: "call", created_at: "2026-09-05T00:00:00.000Z", retired_at: null } },
  { item_id: "other", call_run_id: "r1", offset_seconds: 2, items: { text: "Another run", status: "retired", source: "call", created_at: "2026-09-13T02:32:00.000Z", retired_at: "2026-09-13T02:32:00.000Z" } },
]
const commitments: CommitmentRow[] = [
  { item_id: "dentist", call_run_id: "r2", due: "2026-09-14T12:30:00.000Z", evidence_offset_seconds: 8, items: { text: "Book a dentist appointment" } },
  { item_id: "dentist", call_run_id: "r1", due: null, evidence_offset_seconds: 3, items: { text: "Another run" } },
]
const summary = lastCallSummary(lastRun, runMentions, commitments, KOLKATA, NOW)
eq(summary.mentionCount, runMentions.filter((m) => m.call_run_id === "r2").length, "mention count equals rows on the run")
eq(summary.committed, commitments.filter((c) => c.call_run_id === "r2").length, "committed equals commitment rows on the run")
eq(summary.retired, 1, "retired count")
eq(summary.captured, 1, "captured count")
eq(summary.lines.map((l) => `${l.label}:${l.offset}`).join(","), "Committed:0:08,Retired:0:12,Captured:0:33", "lines in offset order")
eq(summary.lines[0].text, "Book a dentist appointment, by today 18:00", "commitment due in the profile zone")
eq(formatOffset(125), "2:05", "offset format")
eq(lastCallHeadline(lastRun, KOLKATA, NOW, null), "Yesterday at 08:00.", "headline without a duration row")
eq(lastCallHeadline(lastRun, KOLKATA, NOW, 45), "Yesterday at 08:00, 45 seconds.", "headline with duration")
eq(durationSeconds({ started_at: "2026-09-13T02:30:05Z", completed_at: "2026-09-13T02:30:50Z" }), 45, "duration from raw")
eq(durationSeconds({ source: "local-seed" }), null, "no duration without timestamps")

// 7. A first-run account with a slot but no materialised run still gets a real next time.
const saturday = new Date("2026-09-12T03:00:00.000Z")
const slotNext = nextSlotInstant([{ local_time: "08:00:00", weekdays: [1, 2, 3, 4, 5], active: true }], KOLKATA, saturday)
eq(slotNext?.toISOString(), "2026-09-14T02:30:00.000Z", "weekday slot skips the weekend")
eq(nextSlotInstant([{ local_time: "08:00", weekdays: [1], active: false }], KOLKATA, saturday), null, "inactive slot never rings")
eq(
  nextSlotInstant([{ local_time: "08:00", weekdays: [1, 2, 3, 4, 5, 6, 7], active: true }], "America/New_York", NOW)?.toISOString(),
  "2026-09-14T12:00:00.000Z",
  "slot in New York daylight time",
)

// 8. Live steps follow the run's own timestamps.
const live = liveSteps(
  run("live", "awaiting_result", "2026-09-14T02:30:00.000Z", {
    claimed_at: "2026-09-14T02:30:02.000Z",
    dispatched_at: "2026-09-14T02:30:04.000Z",
    poll_after: "2026-09-14T02:31:14.000Z",
  }),
  KOLKATA,
)
eq(live.map((s) => s.status).join(","), "done,done,now,todo,todo", "live step states")
eq(live[1].at, "08:00:04", "call placed clock in the profile zone")
eq(live[2].label, "On the call. Checking again at 08:01:14", "poll clock in the profile zone")

// 9. Navigation marks exactly one current page.
eq(isCurrentNav("/app", "/app"), true, "Today is current on /app")
eq(isCurrentNav("/app/settings", "/app"), false, "Today is not current on Settings")
eq(isCurrentNav("/app/history/abc", "/app/history"), true, "History is current on a subpath")

console.log("today check passed")
