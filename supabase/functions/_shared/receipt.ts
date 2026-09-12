/**
 * T7.4 thin post-call receipt caller.
 *
 * Builds captured and retired texts from structured result data.
 * Then calls `deliverPostCallTelegram`. Never invents counts.
 *
 * T7.3 owns analysis delivery. After a pattern report is stored, call
 * `deliverPatternTelegram` with the validated prose. This file does not.
 *
 * Pin with:
 * `deno test --allow-read supabase/functions/_shared/receipt.ts supabase/functions/_shared/receipt_tests.ts`
 */
import {
  capturedTextsFromStructured,
  deliverPostCallTelegram,
  retiredItemIdsFromStructured,
  type DeliverResult,
  type DeliverTelegramDeps,
} from "./deliver-telegram.ts";

export type ResolveRetiredText = (itemId: string) => Promise<string | null>;

export type PostCallReceiptInput = {
  userId: string;
  callRunId: string;
  structured: unknown;
  resolveRetiredText?: ResolveRetiredText;
};

export async function deliverIngestionReceipt(
  input: PostCallReceiptInput,
  deps: DeliverTelegramDeps,
): Promise<DeliverResult> {
  const capturedTexts = capturedTextsFromStructured(input.structured);
  const retiredIds = retiredItemIdsFromStructured(input.structured);
  const retiredTexts: string[] = [];
  if (input.resolveRetiredText) {
    for (const itemId of retiredIds) {
      const text = await input.resolveRetiredText(itemId);
      if (typeof text === "string" && text !== "") retiredTexts.push(text);
    }
  }
  return deliverPostCallTelegram(
    {
      userId: input.userId,
      callRunId: input.callRunId,
      capturedTexts,
      retiredTexts,
    },
    deps,
  );
}
