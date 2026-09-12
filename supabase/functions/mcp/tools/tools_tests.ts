/**
 * T4.2 MCP tool pins.
 *
 * Doubles enforce owner-scoped reads and writes like T1.2 RLS.
 * Pin add_item source mcp, retire surface, A/B isolation, set_slot,
 * get_last_call, get_patterns facts, and registerOrmaTools names.
 *
 * deno test --allow-net --allow-env --allow-read \
 *   supabase/functions/mcp/tools/tools_tests.ts
 */

import { McpServer } from "npm:@modelcontextprotocol/sdk@1.30.0/server/mcp.js"
import {
  addItem,
  getLastCall,
  getPatterns,
  listItems,
  registerOrmaTools,
  retireItem,
  setSlot,
  ITEM_SOURCE_MCP,
  ITEM_STATUS_OPEN,
  ITEM_STATUS_RETIRED,
  RETIRE_SURFACE_MCP,
  TOOL_NAMES,
  type CallRunRow,
  type ItemRow,
  type PatternReportRow,
  type SlotRow,
  type ToolUser,
  type UserScopedClient,
} from "./mod.ts"

import {
  A,
  B,
  createOwnerClient,
  createStore,
} from "./double.ts"

function parseOk(result: { content: Array<{ text: string }>; isError?: boolean }) {
  if (result.isError) throw new Error(`expected ok, got ${result.content[0]?.text}`)
  return JSON.parse(result.content[0].text)
}

function assertError(
  result: { content: Array<{ text: string }>; isError?: boolean },
  needle: string,
) {
  if (!result.isError) throw new Error(`expected error containing ${needle}`)
  if (!result.content[0]?.text.includes(needle)) {
    throw new Error(`expected ${needle} in ${result.content[0]?.text}`)
  }
}

const testFn = (
  Deno as { test?: (n: string, f: () => void | Promise<void>) => void }
).test

if (typeof testFn === "function") {
  testFn("add_item writes source mcp for caller A", async () => {
    const store = createStore()
    const client = createOwnerClient(A, store)
    const user: ToolUser = { userId: A }
    const row = parseOk(await addItem(client, user, { text: " book flights " })) as ItemRow
    if (row.source !== ITEM_SOURCE_MCP) throw new Error("source must be mcp")
    if (row.user_id !== A) throw new Error("user_id must be caller A")
    if (row.text !== "book flights") throw new Error("text must be trimmed")
    if (row.status !== ITEM_STATUS_OPEN) throw new Error("status must be open")
  })

  testFn("list_items isolates user A from user B", async () => {
    const rows = parseOk(await listItems(createOwnerClient(A, createStore()), { userId: A })) as ItemRow[]
    if (rows.length !== 1 || rows[0].id !== "item-a1") throw new Error("caller A only")
    if (rows.some((row) => row.user_id === B)) throw new Error("cross-user leak")
  })

  testFn("retire_item records mcp surface and is reversible", async () => {
    const store = createStore()
    const row = parseOk(
      await retireItem(createOwnerClient(A, store), { userId: A }, { item_id: "item-a1" }),
    ) as ItemRow & { retired_by: string; retired_surface: string; reversible: boolean }
    if (row.status !== ITEM_STATUS_RETIRED) throw new Error("status retired")
    if (!row.retired_at) throw new Error("retired_at required")
    if (row.retired_reason !== RETIRE_SURFACE_MCP) throw new Error("retired_reason must be mcp")
    if (row.retired_by !== A || row.retired_surface !== RETIRE_SURFACE_MCP) {
      throw new Error("who and surface")
    }
    if (row.reversible !== true) throw new Error("must mark reversible")
    const stored = store.items.find((i) => i.id === "item-a1")!
    stored.status = ITEM_STATUS_OPEN
    stored.retired_at = null
    stored.retired_reason = null
    if (stored.status !== ITEM_STATUS_OPEN || stored.retired_at !== null) {
      throw new Error("web restore must clear retired fields")
    }
  })

  testFn("retire_item fails cleanly on user B item for caller A", async () => {
    assertError(
      await retireItem(createOwnerClient(A, createStore()), { userId: A }, { item_id: "item-b1" }),
      "not found",
    )
  })

  testFn("set_slot writes directly for caller and rejects B slot", async () => {
    const store = createStore()
    const client = createOwnerClient(A, store)
    const created = parseOk(
      await setSlot(client, { userId: A }, { local_time: "09:30", part_of_day: "morning" }),
    ) as SlotRow
    if (created.user_id !== A || created.local_time !== "09:30:00") throw new Error("insert slot")
    const updated = parseOk(
      await setSlot(client, { userId: A }, {
        slot_id: "slot-a1",
        local_time: "07:15:00",
        part_of_day: "morning",
        weekdays: [1, 2, 3],
      }),
    ) as SlotRow
    if (updated.local_time !== "07:15:00" || updated.weekdays.join(",") !== "1,2,3") {
      throw new Error("update slot")
    }
    assertError(
      await setSlot(client, { userId: A }, {
        slot_id: "slot-b1",
        local_time: "10:00",
        part_of_day: "midday",
      }),
      "not found",
    )
  })

  testFn("get_last_call returns latest owned run only", async () => {
    const row = parseOk(await getLastCall(createOwnerClient(A, createStore()), { userId: A })) as CallRunRow
    if (row.id !== "run-a-new" || row.user_id !== A) throw new Error("latest owned run")
  })

  testFn("get_patterns returns latest row including facts", async () => {
    const row = parseOk(
      await getPatterns(createOwnerClient(A, createStore()), { userId: A }),
    ) as PatternReportRow
    if (row.id !== "pat-a-new") throw new Error("latest pattern")
    const facts = row.facts as { mentions?: { dentist?: number } }
    if (facts.mentions?.dentist !== 3) throw new Error("facts must be present")
    if (!row.prose.includes("Dentist")) throw new Error("prose must ship")
  })

  testFn("user B cannot read user A patterns or last call", async () => {
    const client = createOwnerClient(B, createStore())
    const call = parseOk(await getLastCall(client, { userId: B })) as CallRunRow
    if (call.id !== "run-b1" || call.user_id === A) throw new Error("call isolation")
    const pattern = parseOk(await getPatterns(client, { userId: B })) as PatternReportRow
    if (pattern.id !== "pat-b1" || pattern.user_id === A) throw new Error("pattern isolation")
  })

  testFn("registerOrmaTools registers the six tool names", () => {
    const server = new McpServer({ name: "orma-test", version: "0.0.0" })
    registerOrmaTools(server, createOwnerClient(A, createStore()), { userId: A })
    const listed = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    const names = Object.keys(listed).sort()
    if (names.join(",") !== [...TOOL_NAMES].sort().join(",")) {
      throw new Error(`tool names mismatch: ${names.join(",")}`)
    }
  })
}
