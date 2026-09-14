/**
 * Today's reads, in the browser, under row-level security.
 * It returns rows only. model.ts turns them into what the page shows.
 */
import type { BrowserSupabase } from "$lib/supabase"
import {
  pickLastCall,
  type CommitmentRow,
  type ItemRow,
  type MentionRow,
  type RunMentionRow,
  type RunRow,
  type SlotRow,
} from "./model"

export type TodayRows = {
  profile: { display_name: string; timezone: string } | null
  runs: RunRow[]
  slots: SlotRow[]
  items: ItemRow[]
  openMentions: MentionRow[]
  lastCall: RunRow | null
  lastMentions: RunMentionRow[]
  lastCommitments: CommitmentRow[]
  lastTranscriptRaw: unknown
  loadedAt: string
}

const RUN_COLUMNS =
  "id,state,disposition,mood,scheduled_for,claimed_at,dispatched_at,completed_at,poll_after"

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Could not read ${what}: ${result.error.message}`)
  return result.data
}

export async function loadTodayRows(supabase: BrowserSupabase, userId: string): Promise<TodayRows> {
  const [profileRes, runsRes, slotsRes, itemsRes] = await Promise.all([
    supabase.from("profiles").select("display_name,timezone").eq("id", userId).maybeSingle(),
    supabase
      .from("call_runs")
      .select(RUN_COLUMNS)
      .eq("user_id", userId)
      .order("scheduled_for", { ascending: false })
      .limit(200),
    supabase.from("slots").select("local_time,weekdays,active").eq("user_id", userId),
    supabase
      .from("items")
      .select("id,text,status,since_date,created_at,source")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
  ])

  const profile = must(profileRes, "your profile")
  const runs = must(runsRes, "your calls") as RunRow[]
  const slots = must(slotsRes, "your call times") as SlotRow[]
  const items = must(itemsRes, "your items") as ItemRow[]

  const ids = items.map((item) => item.id)
  const lastCall = pickLastCall(runs)

  const [mentionsRes, lastMentionsRes, lastCommitmentsRes, transcriptRes] = await Promise.all([
    ids.length > 0
      ? supabase.from("item_mentions").select("item_id,call_run_id,offset_seconds").in("item_id", ids)
      : Promise.resolve({ data: [] as MentionRow[], error: null }),
    lastCall
      ? supabase
          .from("item_mentions")
          .select("item_id,call_run_id,offset_seconds,items(text,status,source,created_at,retired_at)")
          .eq("call_run_id", lastCall.id)
      : Promise.resolve({ data: [], error: null }),
    lastCall
      ? supabase
          .from("commitments")
          .select("item_id,call_run_id,due,evidence_offset_seconds,items(text)")
          .eq("call_run_id", lastCall.id)
      : Promise.resolve({ data: [], error: null }),
    lastCall
      ? supabase.from("transcripts").select("raw").eq("call_run_id", lastCall.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  return {
    profile,
    runs,
    slots,
    items,
    openMentions: must(mentionsRes, "item mentions") as MentionRow[],
    lastCall,
    lastMentions: must(lastMentionsRes, "the last call's mentions") as unknown as RunMentionRow[],
    lastCommitments: must(lastCommitmentsRes, "the last call's commitments") as unknown as CommitmentRow[],
    lastTranscriptRaw: (must(transcriptRes, "the last call's transcript") as { raw: unknown } | null)?.raw ?? null,
    loadedAt: new Date().toISOString(),
  }
}
