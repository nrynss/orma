/**
 * Deno tests for T3.3 voice (part C).
 */
import { START_LINK_PROMPT } from "./link.ts";
import { ITEM_SOURCE_TELEGRAM } from "./capture.ts";
import {
  DEFAULT_VOICE_MIME,
  VOICE_FAIL_TEXT,
  captureVoiceNote,
  createMemoryVoiceStore,
  itemAudioUrl,
  type VoiceChat,
} from "./voice.ts";
import { createRestVoiceStore } from "./voice_rest.ts";

const testFn = (Deno as { test?: (name: string, fn: () => Promise<void>) => void }).test;
if (typeof testFn === "function" && !import.meta.main) {
  const userA = "00000000-0000-4000-8000-00000000000a";
  const userB = "00000000-0000-4000-8000-00000000000b";
  const chatA = 1001;
  const thought = "Book a dentist appointment";
  const opus = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x01]);

  function recordingChat(log: string[]): VoiceChat & { ackAt?: number; workAt?: number } {
    const chat: VoiceChat & { ackAt?: number; workAt?: number } = {
      async sendAck() {
        chat.ackAt = Date.now();
        log.push("ack");
        return { messageId: 9 };
      },
      async editMessage(_chatId, messageId, text, replyMarkup) {
        log.push(`edit:${messageId}:${text}`);
        if (replyMarkup) {
          log.push(`markup:${replyMarkup.inline_keyboard[0][0].callback_data}`);
        }
      },
      async sendMessage(_chatId, text, replyMarkup) {
        log.push(`send:${text}`);
        if (replyMarkup) {
          log.push(`send-markup:${replyMarkup.inline_keyboard[0][0].callback_data}`);
        }
      },
      async downloadVoice() {
        chat.workAt = Date.now();
        log.push("download");
        return { bytes: opus, mimeType: DEFAULT_VOICE_MIME };
      },
    };
    return chat;
  }

  testFn("an empty transcript is a failed capture the user can act on", async () => {
    const store = createMemoryVoiceStore([{ id: userA, telegramChatId: chatA }]);
    const result = await captureVoiceNote({
      store,
      chat: recordingChat([]),
      transcribe: async () => "   ",
      chatId: chatA,
      messageId: 3,
      fileId: "file-1",
    });
    if (result.status !== "failed") throw new Error(`expected failed, got ${result.status}`);
    if (result.editText !== VOICE_FAIL_TEXT) throw new Error("empty transcript must use VOICE_FAIL_TEXT");
    const owned = await store.listItemsByUser(userA);
    if (owned.length !== 0) throw new Error("empty transcript must not insert an item");
  });

}
