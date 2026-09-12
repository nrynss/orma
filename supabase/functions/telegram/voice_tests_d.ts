/**
 * Deno tests for T3.3 voice (part D) — includes insert-then-edit regression.
 */
import {
  DEFAULT_VOICE_MIME,
  VOICE_ACK_TEXT,
  VOICE_CONFIRM_BUTTON,
  VOICE_FAIL_TEXT,
  captureVoiceNote,
  createMemoryVoiceStore,
  recordedVoiceReply,
  vertexGenerateContentUrl,
  voiceConfirmMarkup,
  type VoiceChat,
} from "./voice.ts";
import { createTelegramVoiceChat } from "./voice_telegram.ts";
import {
  createVertexTranscriber,
  testServiceAccountJson,
  vertexTranscriberFromEnv,
} from "./voice_vertex.ts";

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

  testFn("telegram chat acks before getFile and later edits that message", async () => {
    const log: string[] = [];
    const token = "1:test-token";
    const chat = createTelegramVoiceChat({
      botToken: token,
      fetch: async (input, init) => {
        const url = String(input);
        const body = typeof init?.body === "string" ? init.body : "";
        log.push(`${init?.method ?? "GET"}:${url}:${body}`);
        if (url.endsWith("/sendMessage")) {
          return new Response(
            JSON.stringify({ ok: true, result: { message_id: 11 } }),
            { headers: { "content-type": "application/json" } },
          );
        }
        if (url.endsWith("/getFile")) {
          return new Response(
            JSON.stringify({ ok: true, result: { file_path: "voice/file.oga" } }),
            { headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/file/bot")) {
          return new Response(opus);
        }
        if (url.endsWith("/editMessageText")) {
          return new Response(JSON.stringify({ ok: true, result: true }), {
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected ${url}`);
      },
    });
    const ack = await chat.sendAck(chatA, 3);
    if (ack.messageId !== 11) throw new Error("ack must return Telegram message_id");
    if (!log[0].includes("/sendMessage")) throw new Error("first Bot API call must be sendMessage");
    if (!log[0].includes(VOICE_ACK_TEXT)) throw new Error("sendMessage must carry VOICE_ACK_TEXT");
    const file = await chat.downloadVoice("file-1");
    if (file.bytes.length !== opus.length) throw new Error("download must return the Opus bytes");
    await chat.editMessage(chatA, ack.messageId, recordedVoiceReply(thought), voiceConfirmMarkup("item-1"));
    const edit = log.find((line) => line.includes("/editMessageText"));
    if (!edit) throw new Error("edit must call editMessageText");
    if (!edit.includes(`"message_id":11`)) throw new Error("edit must target the ack message");
    if (!edit.includes(VOICE_CONFIRM_BUTTON)) throw new Error("edit must include the confirm control");
  });

  testFn("vertex transcriber posts generateContent with inline audio and no project host", async () => {
    const calls: string[] = [];
    const transcribe = createVertexTranscriber({
      project: "nryn-personal",
      location: "us-central1",
      model: "gemini-3.8-flash",
      credentialsJson: await testServiceAccountJson(),
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("supabase.co")) throw new Error("must not use the project host");
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "ya29.test" }), {
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes(":generateContent")) {
          const body = typeof init?.body === "string" ? init.body : "";
          if (!body.includes("inlineData")) throw new Error("vertex body must include inlineData");
          if (!body.includes("audio/ogg")) throw new Error("vertex body must include the mime type");
          return new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: thought }] } }],
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`unexpected ${url}`);
      },
    });
    const text = await transcribe(opus, DEFAULT_VOICE_MIME);
    if (text !== thought) throw new Error("transcriber must return candidate text");
    const generate = calls.find((url) => url.includes(":generateContent"));
    const expected = vertexGenerateContentUrl("nryn-personal", "us-central1", "gemini-3.8-flash");
    if (generate !== expected) throw new Error("generateContent url must use Vertex project and model");
  });

}
