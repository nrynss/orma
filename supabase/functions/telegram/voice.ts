/**
 * T3.3 Telegram voice capture.
 *
 * Acknowledge first. Then download Opus, transcribe with Gemini, and store audio.
 * Edit the ack in place with the transcript and a confirm control.
 *
 * The bot never stays silent while the model runs.
 * A failed transcription edits the ack with a line a human can act on.
 *
 * Pin ack, edit, stored audio, and failure with:
 * `deno test --allow-read supabase/functions/telegram/voice.ts`
 *
 * T3.1 should call `captureVoiceNote` for a voice update.
 * It should not wait on Gemini before that call returns the ack path.
 */
import { recordedCaptureReply, ITEM_SOURCE_TELEGRAM } from "./capture.ts";
import type { CaptureProfile } from "./capture.ts";
import { START_LINK_PROMPT } from "./link.ts";

export const ITEM_AUDIO_BUCKET = "item-audio";
export const VOICE_ACK_TEXT = "Got it. Transcribing now.";
export const VOICE_FAIL_TEXT =
  "I could not transcribe that voice note. Send the thought as text, or try another voice note.";
export const VOICE_CONFIRM_CALLBACK_PREFIX = "voice_ok:";
export const VOICE_CONFIRM_BUTTON = "Confirm";
export const DEFAULT_VOICE_MIME = "audio/ogg";

export type VoiceItem = {
  id: string;
  userId: string;
  text: string;
  source: typeof ITEM_SOURCE_TELEGRAM;
  audioUrl: string;
};

export type VoiceReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export type AckMessage = {
  messageId: number;
};

export interface VoiceChat {
  sendAck(chatId: number, replyToMessageId: number): Promise<AckMessage>;
  editMessage(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: VoiceReplyMarkup,
  ): Promise<void>;
  downloadVoice(fileId: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
}

export interface VoiceStore {
  findProfileByChatId(chatId: number): Promise<CaptureProfile | null>;
  insertVoiceItem(input: {
    id: string;
    userId: string;
    text: string;
    audio: Uint8Array;
    mimeType: string;
  }): Promise<VoiceItem>;
  listItemsByUser(userId: string): Promise<VoiceItem[]>;
}

export type TranscribeVoice = (audio: Uint8Array, mimeType: string) => Promise<string>;

export type VoiceCaptureResult =
  | { status: "unlinked"; ackMessageId: number }
  | { status: "captured"; ackMessageId: number; item: VoiceItem; editText: string }
  | { status: "failed"; ackMessageId: number; editText: string };

export function itemAudioObjectPath(userId: string, itemId: string): string {
  return `${userId}/${itemId}.ogg`;
}

export function itemAudioUrl(apiUrl: string, userId: string, itemId: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  const objectPath = itemAudioObjectPath(userId, itemId);
  return `${base}/storage/v1/object/${ITEM_AUDIO_BUCKET}/${objectPath}`;
}

export function voiceConfirmCallbackData(itemId: string): string {
  return `${VOICE_CONFIRM_CALLBACK_PREFIX}${itemId}`;
}

export function parseVoiceConfirmCallback(data: string | undefined): string | null {
  if (typeof data !== "string") return null;
  if (!data.startsWith(VOICE_CONFIRM_CALLBACK_PREFIX)) return null;
  const itemId = data.slice(VOICE_CONFIRM_CALLBACK_PREFIX.length);
  if (itemId === "") return null;
  return itemId;
}

export function voiceConfirmMarkup(itemId: string): VoiceReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: VOICE_CONFIRM_BUTTON, callback_data: voiceConfirmCallbackData(itemId) }],
    ],
  };
}

export function recordedVoiceReply(text: string): string {
  return recordedCaptureReply(text);
}

export function vertexGenerateContentUrl(
  project: string,
  location: string,
  model: string,
): string {
  const host = location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

export async function captureVoiceNote(args: {
  store: VoiceStore;
  chat: VoiceChat;
  transcribe: TranscribeVoice;
  chatId: number;
  messageId: number;
  fileId: string;
}): Promise<VoiceCaptureResult> {
  const ack = await args.chat.sendAck(args.chatId, args.messageId);

  try {
    const profile = await args.store.findProfileByChatId(args.chatId);
    if (profile === null) {
      await args.chat.editMessage(args.chatId, ack.messageId, START_LINK_PROMPT);
      return { status: "unlinked", ackMessageId: ack.messageId };
    }

    const file = await args.chat.downloadVoice(args.fileId);
    const raw = await args.transcribe(file.bytes, file.mimeType);
    const text = raw.trim();
    if (text === "") {
      await args.chat.editMessage(args.chatId, ack.messageId, VOICE_FAIL_TEXT);
      return {
        status: "failed",
        ackMessageId: ack.messageId,
        editText: VOICE_FAIL_TEXT,
      };
    }

    const itemId = crypto.randomUUID();
    const item = await args.store.insertVoiceItem({
      id: itemId,
      userId: profile.id,
      text,
      audio: file.bytes,
      mimeType: file.mimeType,
    });
    if (item.userId !== profile.id) {
      throw new Error("inserted voice item user must match the linked profile");
    }
    if (item.source !== ITEM_SOURCE_TELEGRAM) {
      throw new Error("inserted voice item source must be telegram");
    }
    if (item.text !== text) {
      throw new Error("inserted voice item text must match the transcript");
    }
    if (!item.audioUrl.includes(item.id)) {
      throw new Error("inserted voice item must carry a storage link for this item");
    }

    const editText = recordedVoiceReply(item.text);
    await args.chat.editMessage(
      args.chatId,
      ack.messageId,
      editText,
      voiceConfirmMarkup(item.id),
    );
    return {
      status: "captured",
      ackMessageId: ack.messageId,
      item,
      editText,
    };
  } catch {
    await args.chat.editMessage(args.chatId, ack.messageId, VOICE_FAIL_TEXT);
    return {
      status: "failed",
      ackMessageId: ack.messageId,
      editText: VOICE_FAIL_TEXT,
    };
  }
}

export function createMemoryVoiceStore(
  seed: Array<{ id: string; telegramChatId?: number | null }> = [],
): VoiceStore {
  const profiles = new Map<string, CaptureProfile & { telegramChatId: number | null }>();
  const items: VoiceItem[] = [];
  for (const profile of seed) {
    profiles.set(profile.id, {
      id: profile.id,
      telegramChatId: profile.telegramChatId ?? null,
    });
  }

  return {
    async findProfileByChatId(chatId) {
      for (const profile of profiles.values()) {
        if (profile.telegramChatId === chatId) return { id: profile.id };
      }
      return null;
    },
    async insertVoiceItem(input) {
      const item: VoiceItem = {
        id: input.id,
        userId: input.userId,
        text: input.text,
        source: ITEM_SOURCE_TELEGRAM,
        audioUrl: itemAudioUrl("https://orma-api.nryn.dev", input.userId, input.id),
      };
      items.push(item);
      return { ...item };
    },
    async listItemsByUser(userId) {
      return items.filter((item) => item.userId === userId).map((item) => ({ ...item }));
    },
  };
}

export type RestVoiceStoreDeps = {
  apiUrl: string;
  serviceRoleKey: string;
  fetch: typeof fetch;
};

/**
 * PostgREST plus Storage adapter for a voice item.
 * Reach the API through `ORMA_API_URL`. Never use a project host.
 * Auth uses `SUPABASE_SERVICE_ROLE_KEY`. Do not log the key.
 */
export function createRestVoiceStore(deps: RestVoiceStoreDeps): VoiceStore {
  const base = deps.apiUrl.replace(/\/+$/, "");
  const key = deps.serviceRoleKey;

  const headers = (prefer?: string): Record<string, string> => {
    const next: Record<string, string> = {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    };
    if (prefer) next.prefer = prefer;
    return next;
  };

  const url = (path: string, query: string) => `${base}/rest/v1/${path}?${query}`;

  return {
    async findProfileByChatId(chatId) {
      const response = await deps.fetch(
        url("profiles", `telegram_chat_id=eq.${chatId}&select=id,telegram_chat_id`),
        { headers: headers() },
      );
      if (!response.ok) throw new Error("profiles chat read failed");
      const rows = (await response.json()) as RestProfileRow[];
      if (rows.length === 0) return null;
      return { id: rows[0].id };
    },
    async insertVoiceItem(input) {
      const objectPath = itemAudioObjectPath(input.userId, input.id);
      const audioUrl = itemAudioUrl(base, input.userId, input.id);
      const audioBody = new ArrayBuffer(input.audio.byteLength);
      new Uint8Array(audioBody).set(input.audio);
      const upload = await deps.fetch(
        `${base}/storage/v1/object/${ITEM_AUDIO_BUCKET}/${objectPath}`,
        {
          method: "POST",
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            "content-type": input.mimeType,
            "x-upsert": "true",
          },
          body: audioBody,
        },
      );
      if (!upload.ok) throw new Error("voice audio upload failed");

      const response = await deps.fetch(`${base}/rest/v1/items`, {
        method: "POST",
        headers: headers("return=representation"),
        body: JSON.stringify({
          id: input.id,
          user_id: input.userId,
          text: input.text,
          source: ITEM_SOURCE_TELEGRAM,
          audio_url: audioUrl,
        }),
      });
      if (!response.ok) throw new Error("items insert failed");
      const rows = (await response.json()) as RestVoiceItemRow[];
      if (rows.length !== 1) throw new Error("items insert must return one row");
      return fromRestVoiceItem(rows[0]);
    },
    async listItemsByUser(userId) {
      const response = await deps.fetch(
        url(
          "items",
          `user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,text,source,audio_url`,
        ),
        { headers: headers() },
      );
      if (!response.ok) throw new Error("items read failed");
      const rows = (await response.json()) as RestVoiceItemRow[];
      return rows.map(fromRestVoiceItem);
    },
  };
}

type RestProfileRow = {
  id: string;
  telegram_chat_id: number | null;
};

type RestVoiceItemRow = {
  id: string;
  user_id: string;
  text: string;
  source: string;
  audio_url: string;
};

function fromRestVoiceItem(row: RestVoiceItemRow): VoiceItem {
  if (row.source !== ITEM_SOURCE_TELEGRAM) {
    throw new Error("items row source must be telegram");
  }
  if (!row.audio_url) {
    throw new Error("items row must carry audio_url");
  }
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    source: ITEM_SOURCE_TELEGRAM,
    audioUrl: row.audio_url,
  };
}

export type TelegramVoiceChatDeps = {
  botToken: string;
  fetch: typeof fetch;
};

export function createTelegramVoiceChat(deps: TelegramVoiceChatDeps): VoiceChat {
  const api = `https://api.telegram.org/bot${deps.botToken}`;
  const files = `https://api.telegram.org/file/bot${deps.botToken}`;

  return {
    async sendAck(chatId, replyToMessageId) {
      const response = await deps.fetch(`${api}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: VOICE_ACK_TEXT,
          reply_to_message_id: replyToMessageId,
        }),
      });
      if (!response.ok) throw new Error("voice ack send failed");
      const parsed = (await response.json()) as {
        ok?: boolean;
        result?: { message_id?: number };
      };
      const messageId = parsed.result?.message_id;
      if (parsed.ok !== true || typeof messageId !== "number") {
        throw new Error("voice ack send failed");
      }
      return { messageId };
    },
    async editMessage(chatId, messageId, text, replyMarkup) {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        message_id: messageId,
        text,
      };
      if (replyMarkup) body.reply_markup = replyMarkup;
      const response = await deps.fetch(`${api}/editMessageText`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("voice edit failed");
    },
    async downloadVoice(fileId) {
      const meta = await deps.fetch(`${api}/getFile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      if (!meta.ok) throw new Error("voice file lookup failed");
      const parsed = (await meta.json()) as {
        ok?: boolean;
        result?: { file_path?: string };
      };
      const filePath = parsed.result?.file_path;
      if (parsed.ok !== true || typeof filePath !== "string" || filePath === "") {
        throw new Error("voice file lookup failed");
      }
      const file = await deps.fetch(`${files}/${filePath}`);
      if (!file.ok) throw new Error("voice file download failed");
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { bytes, mimeType: DEFAULT_VOICE_MIME };
    },
  };
}

export type VertexTranscriberDeps = {
  project: string;
  location: string;
  model: string;
  credentialsJson: string;
  fetch: typeof fetch;
};

export function createVertexTranscriber(deps: VertexTranscriberDeps): TranscribeVoice {
  return async (audio, mimeType) => {
    const accessToken = await googleAccessToken(deps.credentialsJson, deps.fetch);
    const url = vertexGenerateContentUrl(deps.project, deps.location, deps.model);
    const response = await deps.fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Transcribe the spoken words only. Do not add commentary. If the audio is unintelligible, reply with an empty string.",
              },
              {
                inlineData: {
                  mimeType,
                  data: bytesToBase64(audio),
                },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error("vertex transcribe failed");
    const parsed = (await response.json()) as VertexGenerateResponse;
    const text = parsed.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
    return text;
  };
}

export function vertexTranscriberFromEnv(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
  fetchImpl: typeof fetch = fetch,
): TranscribeVoice {
  return createVertexTranscriber({
    project: requireNamedEnv("GOOGLE_VERTEX_PROJECT", getEnv),
    location: requireNamedEnv("GOOGLE_VERTEX_LOCATION", getEnv),
    model: requireNamedEnv("GEMINI_MODEL", getEnv),
    credentialsJson: requireNamedEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", getEnv),
    fetch: fetchImpl,
  });
}

function requireNamedEnv(
  name: string,
  getEnv: (key: string) => string | undefined,
): string {
  const value = getEnv(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type VertexGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

async function googleAccessToken(
  credentialsJson: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(credentialsJson) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not JSON");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is missing fields");
  }
  const assertion = await signServiceAccountJwt(sa);
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!response.ok) throw new Error("google token exchange failed");
  const parsed = (await response.json()) as { access_token?: string };
  if (!parsed.access_token) throw new Error("google token exchange failed");
  return parsed.access_token;
}

async function signServiceAccountJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function testServiceAccountJson(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
  return JSON.stringify({
    client_email: "orma-vertex@nryn-personal.iam.gserviceaccount.com",
    private_key: pem,
  });
}

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
      async downloadVoice() {
        chat.workAt = Date.now();
        log.push("download");
        return { bytes: opus, mimeType: DEFAULT_VOICE_MIME };
      },
    };
    return chat;
  }

  testFn("acknowledge is the first side effect and lands within a second", async () => {
    const log: string[] = [];
    const chat = recordingChat(log);
    let transcribeStarted = false;
    const store = createMemoryVoiceStore([{ id: userA, telegramChatId: chatA }]);
    const result = await captureVoiceNote({
      store,
      chat,
      transcribe: async () => {
        transcribeStarted = true;
        if (log[0] !== "ack") throw new Error("transcribe must not start before ack");
        log.push("transcribe");
        return thought;
      },
      chatId: chatA,
      messageId: 3,
      fileId: "file-1",
    });
    if (log[0] !== "ack") throw new Error(`expected ack first, got ${log.join(",")}`);
    if (typeof chat.ackAt !== "number" || typeof chat.workAt !== "number") {
      throw new Error("ack and download must both run");
    }
    if (chat.workAt < chat.ackAt) throw new Error("download must not precede ack");
    if (chat.workAt - chat.ackAt >= 1000) {
      throw new Error("ack to download must stay under one second in this double");
    }
    if (!transcribeStarted) throw new Error("transcribe must run after ack");
    if (result.status !== "captured") throw new Error(`expected captured, got ${result.status}`);
    if (result.ackMessageId !== 9) throw new Error("result must name the ack message");
  });

  testFn("the ack message is edited in place with the transcript and confirm control", async () => {
    const log: string[] = [];
    const chat = recordingChat(log);
    const store = createMemoryVoiceStore([{ id: userA, telegramChatId: chatA }]);
    const result = await captureVoiceNote({
      store,
      chat,
      transcribe: async () => thought,
      chatId: chatA,
      messageId: 3,
      fileId: "file-1",
    });
    if (result.status !== "captured") throw new Error(`expected captured, got ${result.status}`);
    const expected = recordedVoiceReply(thought);
    if (result.editText !== expected) throw new Error("edit text must quote the transcript");
    const edit = log.find((line) => line.startsWith("edit:9:"));
    if (edit !== `edit:9:${expected}`) {
      throw new Error("must edit the ack message with the recorded transcript");
    }
    const markup = log.find((line) => line.startsWith("markup:"));
    if (markup !== `markup:${voiceConfirmCallbackData(result.item.id)}`) {
      throw new Error("edit must attach the confirm control for this item");
    }
    if (parseVoiceConfirmCallback(voiceConfirmCallbackData(result.item.id)) !== result.item.id) {
      throw new Error("confirm callback must round-trip the item id");
    }
  });

  testFn("the item carries a storage link for the uploaded audio", async () => {
    const store = createMemoryVoiceStore([{ id: userA, telegramChatId: chatA }]);
    const result = await captureVoiceNote({
      store,
      chat: recordingChat([]),
      transcribe: async () => thought,
      chatId: chatA,
      messageId: 3,
      fileId: "file-1",
    });
    if (result.status !== "captured") throw new Error(`expected captured, got ${result.status}`);
    if (!result.item.audioUrl.includes(result.item.id)) {
      throw new Error("audio url must include the item id");
    }
    if (!result.item.audioUrl.includes(ITEM_AUDIO_BUCKET)) {
      throw new Error("audio url must point at the item-audio bucket");
    }
    if (result.item.audioUrl.includes("supabase.co")) {
      throw new Error("audio url must use ORMA_API_URL, not the project host");
    }
    const owned = await store.listItemsByUser(userA);
    if (owned.length !== 1) throw new Error(`expected one item, got ${owned.length}`);
    if (owned[0].audioUrl !== result.item.audioUrl) {
      throw new Error("listed item must keep the storage link");
    }
    const other = await store.listItemsByUser(userB);
    if (other.length !== 0) throw new Error("voice capture must not insert under another user");
  });

  testFn("a failed transcription edits the ack with an actionable message and inserts nothing", async () => {
    const log: string[] = [];
    const store = createMemoryVoiceStore([{ id: userA, telegramChatId: chatA }]);
    const result = await captureVoiceNote({
      store,
      chat: recordingChat(log),
      transcribe: async () => {
        throw new Error("model down");
      },
      chatId: chatA,
      messageId: 3,
      fileId: "file-1",
    });
    if (result.status !== "failed") throw new Error(`expected failed, got ${result.status}`);
    if (result.editText !== VOICE_FAIL_TEXT) throw new Error("failed edit must be VOICE_FAIL_TEXT");
    if (result.editText.toLowerCase().includes("error")) {
      throw new Error("failed message must not read as an error dump");
    }
    if (!log.includes(`edit:9:${VOICE_FAIL_TEXT}`)) {
      throw new Error("failed transcription must edit the ack in place");
    }
    if (log.some((line) => line.startsWith("markup:"))) {
      throw new Error("failed transcription must not attach confirm");
    }
    const owned = await store.listItemsByUser(userA);
    if (owned.length !== 0) throw new Error("failed transcription must not insert an item");
  });

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

  testFn("an unlinked chat is acknowledged then prompted, with no item", async () => {
    const log: string[] = [];
    const store = createMemoryVoiceStore([{ id: userA }]);
    const result = await captureVoiceNote({
      store,
      chat: recordingChat(log),
      transcribe: async () => {
        throw new Error("transcribe must not run for an unlinked chat");
      },
      chatId: chatA,
      messageId: 3,
      fileId: "file-1",
    });
    if (result.status !== "unlinked") throw new Error(`expected unlinked, got ${result.status}`);
    if (log[0] !== "ack") throw new Error("unlinked voice must still ack first");
    if (!log.includes(`edit:9:${START_LINK_PROMPT}`)) {
      throw new Error("unlinked voice must edit the ack to START_LINK_PROMPT");
    }
    if (log.includes("download")) throw new Error("unlinked voice must not download audio");
    const owned = await store.listItemsByUser(userA);
    if (owned.length !== 0) throw new Error("unlinked voice must not insert an item");
  });

  testFn("rest store uploads audio then inserts audio_url through ORMA_API_URL", async () => {
    const calls: Array<{ url: string; method: string; body: string; contentType: string }> = [];
    const itemId = "30000000-0000-4000-8000-00000000000a";
    const store = createRestVoiceStore({
      apiUrl: "https://orma-api.nryn.dev",
      serviceRoleKey: "service-role-test-value",
      fetch: async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const contentType = new Headers(init?.headers).get("content-type") ?? "";
        let body = "";
        if (typeof init?.body === "string") body = init.body;
        else if (init?.body instanceof ArrayBuffer) body = `bytes:${init.body.byteLength}`;
        else if (init?.body instanceof Uint8Array) body = `bytes:${init.body.length}`;
        else if (init?.body instanceof Blob) body = `bytes:${init.body.size}`;
        calls.push({ url, method, body, contentType });
        if (url.includes("supabase.co")) throw new Error("must not use the project host");
        if (url.includes("profiles") && method === "GET") {
          return new Response(
            JSON.stringify([{ id: userA, telegram_chat_id: chatA }]),
            { headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/storage/v1/object/") && method === "POST") {
          return new Response(JSON.stringify({ Key: "item-audio/x" }), { status: 200 });
        }
        if (url.includes("/items") && method === "POST") {
          const posted = JSON.parse(body) as RestVoiceItemRow;
          return new Response(JSON.stringify([posted]), {
            status: 201,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      },
    });
    const item = await store.insertVoiceItem({
      id: itemId,
      userId: userA,
      text: thought,
      audio: opus,
      mimeType: DEFAULT_VOICE_MIME,
    });
    const upload = calls.find((call) => call.method === "POST" && call.url.includes("/storage/v1/object/"));
    if (!upload) throw new Error("voice store must POST the audio object");
    if (!upload.url.startsWith("https://orma-api.nryn.dev/storage/v1/object/item-audio/")) {
      throw new Error("audio upload must use ORMA_API_URL and item-audio");
    }
    if (!upload.url.includes(itemId)) throw new Error("object path must include the item id");
    if (upload.contentType !== DEFAULT_VOICE_MIME) {
      throw new Error("upload must send the Opus mime type");
    }
    const insert = calls.find((call) => call.method === "POST" && call.url.includes("/rest/v1/items"));
    if (!insert) throw new Error("voice store must POST /rest/v1/items");
    if (!insert.body.includes(`"audio_url":"${item.audioUrl}"`)) {
      throw new Error("insert body must set audio_url to the storage link");
    }
    if (!insert.body.includes(`"source":"${ITEM_SOURCE_TELEGRAM}"`)) {
      throw new Error("insert body must set source telegram");
    }
    if (insert.body.includes("service-role-test-value")) {
      throw new Error("service role key must not appear in the items body");
    }
    if (item.audioUrl !== itemAudioUrl("https://orma-api.nryn.dev", userA, itemId)) {
      throw new Error("returned item must carry the storage link");
    }
    const uploadIndex = calls.findIndex((call) => call.url.includes("/storage/v1/object/"));
    const insertIndex = calls.findIndex((call) => call.url.includes("/rest/v1/items"));
    if (uploadIndex < 0 || insertIndex < 0 || uploadIndex > insertIndex) {
      throw new Error("audio must upload before the items insert");
    }
  });

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

  testFn("vertexTranscriberFromEnv throws when GEMINI_MODEL is missing", async () => {
    try {
      vertexTranscriberFromEnv((name) => {
        if (name === "GEMINI_MODEL") return undefined;
        return "present";
      });
      throw new Error("expected missing GEMINI_MODEL");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "missing GEMINI_MODEL") {
        throw new Error("must name the missing GEMINI_MODEL variable");
      }
    }
  });
}
