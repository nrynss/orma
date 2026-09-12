/**
 * Shared MCP tool constants and result helpers for T4.2.
 *
 * Item source for this surface is always `mcp`.
 * Retirement records surface `mcp` in `retired_reason`.
 * Reversible from the web by clearing status and retired fields.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2"
import type { Database } from "../../_shared/database.types.ts"

export const ITEM_SOURCE_MCP = "mcp" as const
export const RETIRE_SURFACE_MCP = "mcp" as const
export const ITEM_STATUS_OPEN = "open" as const
export const ITEM_STATUS_RETIRED = "retired" as const

export const PARTS_OF_DAY = ["morning", "midday", "evening"] as const
export type PartOfDay = (typeof PARTS_OF_DAY)[number]

export const TOOL_NAMES = [
  "add_item",
  "list_items",
  "retire_item",
  "set_slot",
  "get_last_call",
  "get_patterns",
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export type UserScopedClient = SupabaseClient<Database>

export type ToolUser = {
  userId: string
}

export type ToolContentResult = {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export function toolOk(payload: unknown): ToolContentResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  }
}

export function toolErr(message: string): ToolContentResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  }
}

export type ItemRow = Database["public"]["Tables"]["items"]["Row"]
export type SlotRow = Database["public"]["Tables"]["slots"]["Row"]
export type CallRunRow = Database["public"]["Tables"]["call_runs"]["Row"]
export type PatternReportRow = Database["public"]["Tables"]["pattern_reports"]["Row"]
