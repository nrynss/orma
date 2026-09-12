/**
 * T4.2 MCP tool handlers.
 *
 * All access goes through the caller's user-scoped Supabase client.
 * Never service role. RLS enforces owner isolation.
 */

import {
  ITEM_SOURCE_MCP,
  ITEM_STATUS_OPEN,
  ITEM_STATUS_RETIRED,
  PARTS_OF_DAY,
  RETIRE_SURFACE_MCP,
  toolErr,
  toolOk,
  type CallRunRow,
  type ItemRow,
  type PartOfDay,
  type PatternReportRow,
  type SlotRow,
  type ToolContentResult,
  type ToolUser,
  type UserScopedClient,
} from "./types.ts"

export type AddItemArgs = {
  text: string
  since_date?: string
}

export type RetireItemArgs = {
  item_id: string
  reason?: string
}

export type SetSlotArgs = {
  local_time: string
  part_of_day: PartOfDay
  weekdays?: number[]
  active?: boolean
  slot_id?: string
}

function normalizeLocalTime(value: string): string | null {
  const trimmed = value.trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`
  return null
}

function isPartOfDay(value: string): value is PartOfDay {
  return (PARTS_OF_DAY as readonly string[]).includes(value)
}

export async function addItem(
  client: UserScopedClient,
  user: ToolUser,
  args: AddItemArgs,
): Promise<ToolContentResult> {
  const text = args.text?.trim() ?? ""
  if (text === "") return toolErr("add_item requires non-empty text")

  const insert: {
    user_id: string
    text: string
    source: typeof ITEM_SOURCE_MCP
    status: typeof ITEM_STATUS_OPEN
    since_date?: string
  } = {
    user_id: user.userId,
    text,
    source: ITEM_SOURCE_MCP,
    status: ITEM_STATUS_OPEN,
  }
  if (typeof args.since_date === "string" && args.since_date.trim() !== "") {
    insert.since_date = args.since_date.trim()
  }

  const { data, error } = await client
    .from("items")
    .insert(insert)
    .select("id,user_id,text,status,source,since_date,created_at,retired_at,retired_reason,seeded")
    .single()

  if (error) return toolErr(`add_item failed: ${error.message}`)
  const row = data as ItemRow
  if (row.source !== ITEM_SOURCE_MCP) {
    return toolErr("add_item must write source mcp")
  }
  if (row.user_id !== user.userId) {
    return toolErr("add_item must belong to the caller")
  }
  return toolOk(row)
}

export async function listItems(
  client: UserScopedClient,
  _user: ToolUser,
): Promise<ToolContentResult> {
  const { data, error } = await client
    .from("items")
    .select("id,user_id,text,status,source,since_date,created_at,retired_at,retired_reason,seeded")
    .eq("status", ITEM_STATUS_OPEN)

  if (error) return toolErr(`list_items failed: ${error.message}`)
  return toolOk((data ?? []) as ItemRow[])
}

export async function retireItem(
  client: UserScopedClient,
  user: ToolUser,
  args: RetireItemArgs,
): Promise<ToolContentResult> {
  const itemId = args.item_id?.trim() ?? ""
  if (itemId === "") return toolErr("retire_item requires item_id")

  const retiredAt = new Date().toISOString()
  const reason =
    typeof args.reason === "string" && args.reason.trim() !== ""
      ? `${RETIRE_SURFACE_MCP}:${args.reason.trim()}`
      : RETIRE_SURFACE_MCP

  const { data, error } = await client
    .from("items")
    .update({
      status: ITEM_STATUS_RETIRED,
      retired_at: retiredAt,
      retired_reason: reason,
    })
    .eq("id", itemId)
    .eq("status", ITEM_STATUS_OPEN)
    .select("id,user_id,text,status,source,since_date,created_at,retired_at,retired_reason,seeded")
    .maybeSingle()

  if (error) return toolErr(`retire_item failed: ${error.message}`)
  if (!data) {
    return toolErr("retire_item failed: item not found, not open, or not owned")
  }
  const row = data as ItemRow
  if (row.user_id !== user.userId) {
    return toolErr("retire_item refused: cross-user row")
  }
  if (row.status !== ITEM_STATUS_RETIRED) {
    return toolErr("retire_item must set status retired")
  }
  if (!row.retired_at) {
    return toolErr("retire_item must set retired_at")
  }
  if (!row.retired_reason || !row.retired_reason.startsWith(RETIRE_SURFACE_MCP)) {
    return toolErr("retire_item must record surface mcp")
  }
  return toolOk({
    ...row,
    retired_by: user.userId,
    retired_surface: RETIRE_SURFACE_MCP,
    reversible: true,
  })
}

export async function setSlot(
  client: UserScopedClient,
  user: ToolUser,
  args: SetSlotArgs,
): Promise<ToolContentResult> {
  const localTime = normalizeLocalTime(args.local_time ?? "")
  if (!localTime) {
    return toolErr("set_slot requires local_time as HH:MM or HH:MM:SS")
  }
  if (!isPartOfDay(args.part_of_day)) {
    return toolErr("set_slot requires part_of_day morning, midday, or evening")
  }

  const weekdays = args.weekdays ?? [1, 2, 3, 4, 5, 6, 7]
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return toolErr("set_slot weekdays must be a non-empty array")
  }
  const active = args.active ?? true
  const slotId = args.slot_id?.trim()

  if (slotId) {
    const { data, error } = await client
      .from("slots")
      .update({
        local_time: localTime,
        part_of_day: args.part_of_day,
        weekdays,
        active,
      })
      .eq("id", slotId)
      .select("id,user_id,local_time,part_of_day,weekdays,active,created_at")
      .maybeSingle()

    if (error) return toolErr(`set_slot failed: ${error.message}`)
    if (!data) {
      return toolErr("set_slot failed: slot not found or not owned")
    }
    const row = data as SlotRow
    if (row.user_id !== user.userId) {
      return toolErr("set_slot refused: cross-user row")
    }
    return toolOk(row)
  }

  const { data, error } = await client
    .from("slots")
    .insert({
      user_id: user.userId,
      local_time: localTime,
      part_of_day: args.part_of_day,
      weekdays,
      active,
    })
    .select("id,user_id,local_time,part_of_day,weekdays,active,created_at")
    .single()

  if (error) return toolErr(`set_slot failed: ${error.message}`)
  const row = data as SlotRow
  if (row.user_id !== user.userId) {
    return toolErr("set_slot must belong to the caller")
  }
  return toolOk(row)
}

export async function getLastCall(
  client: UserScopedClient,
  _user: ToolUser,
): Promise<ToolContentResult> {
  const { data, error } = await client
    .from("call_runs")
    .select(
      "id,user_id,state,disposition,mood,scheduled_for,completed_at,local_date,part_of_day,briefing,dry_run,slot_id,created_at",
    )
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return toolErr(`get_last_call failed: ${error.message}`)
  if (!data) return toolOk(null)
  return toolOk(data as CallRunRow)
}

export async function getPatterns(
  client: UserScopedClient,
  _user: ToolUser,
): Promise<ToolContentResult> {
  const { data, error } = await client
    .from("pattern_reports")
    .select("id,user_id,period_start,period_end,facts,prose,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return toolErr(`get_patterns failed: ${error.message}`)
  if (!data) return toolOk(null)
  const row = data as PatternReportRow
  if (row.facts === undefined || row.facts === null) {
    return toolErr("get_patterns must include facts")
  }
  return toolOk(row)
}
