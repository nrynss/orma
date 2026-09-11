/**
 * T3.1 Telegram webhook. Secret sits in the path, then grammY may parse.
 *
 * Runtime env, same names as GitHub secrets and `scripts/bootstrap-env.sh`:
 * `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ORMA_API_URL`.
 * A missing name throws before any update is read.
 *
 * Webhook URL is `${ORMA_API_URL}/functions/v1/telegram/${TELEGRAM_WEBHOOK_SECRET}`.
 * Boot and GET on that path call Telegram `setWebhook`. POST handles updates.
 *
 * Pin forged updates and /start with:
 * `deno test --allow-net --allow-env --allow-read supabase/functions/telegram/index.ts`
 *
 * Live forged POST against the front door should be 401 with an empty body.
 * JWT verification must be off at deploy time. T5.1 owns `config.toml`.
 */
import { Bot, webhookCallback } from "npm:grammy@1.38.3";

export const START_LINK_PROMPT =
  "Welcome to Orma. This chat is not linked yet. Open Orma in the browser, go to Settings, and start this bot with the link from your account. That one press lets Orma record thoughts you send here.";

export interface TelegramDeps {
  botToken: string;
  webhookSecret: string;
  apiUrl: string;
  fetch: typeof fetch;
}

export function requireNamedEnv(
  name: string,
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
): string {
  const value = getEnv(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export function depsFromEnv(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
  fetchImpl: typeof fetch = fetch,
): TelegramDeps {
  return {
    botToken: requireNamedEnv("TELEGRAM_BOT_TOKEN", getEnv),
    webhookSecret: requireNamedEnv("TELEGRAM_WEBHOOK_SECRET", getEnv),
    apiUrl: requireNamedEnv("ORMA_API_URL", getEnv),
    fetch: fetchImpl,
  };
}

export function telegramWebhookUrl(apiUrl: string, secret: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/telegram/${secret}`;
}

export function presentedWebhookSecret(pathname: string): string | null {
  const marker = "/telegram/";
  const index = pathname.indexOf(marker);
  if (index === -1) return null;
  const rest = pathname.slice(index + marker.length).replace(/\/+$/, "");
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export function webhookSecretsMatch(presented: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(presented);
  const right = encoder.encode(expected);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function discarded(): Response {
  return new Response(null, { status: 401 });
}

export function createTelegramBot(deps: TelegramDeps): Bot {
  const bot = new Bot(deps.botToken, { client: { fetch: deps.fetch } });
  bot.command("start", (ctx) => ctx.reply(START_LINK_PROMPT));
  return bot;
}

export function createTelegramHandler(deps: TelegramDeps): (req: Request) => Promise<Response> {
  const bot = createTelegramBot(deps);
  const handleUpdate = webhookCallback(bot, "std/http");

  return async (req: Request): Promise<Response> => {
    const presented = presentedWebhookSecret(new URL(req.url).pathname);
    if (presented === null || !webhookSecretsMatch(presented, deps.webhookSecret)) {
      return discarded();
    }

    if (req.method === "GET") {
      return registerWebhook(deps);
    }

    if (req.method !== "POST") return discarded();

    try {
      return await handleUpdate(req);
    } catch {
      console.error("telegram update failed");
      return new Response(null, { status: 500 });
    }
  };
}

export async function registerWebhook(deps: TelegramDeps): Promise<Response> {
  const webhookUrl = telegramWebhookUrl(deps.apiUrl, deps.webhookSecret);
  const telegramUrl = `https://api.telegram.org/bot${deps.botToken}/setWebhook`;
  const response = await deps.fetch(telegramUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const body = await response.text();
  let ok = false;
  try {
    const parsed = JSON.parse(body) as { ok?: boolean };
    ok = parsed.ok === true;
  } catch {
    ok = false;
  }
  if (!ok) return new Response(null, { status: 502 });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

if (import.meta.main) {
  const deps = depsFromEnv();
  registerWebhook(deps).catch(() => {
    console.error("telegram setWebhook failed");
  });
  Deno.serve(createTelegramHandler(deps));
}

function startUpdate(): string {
  return JSON.stringify({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Ada" },
      text: "/start",
      entities: [{ offset: 0, length: 6, type: "bot_command" }],
    },
  });
}

const testFn = (Deno as { test?: (name: string, fn: () => Promise<void>) => void }).test;
if (typeof testFn === "function" && !import.meta.main) {
  const secret = crypto.randomUUID();
  const botToken = `1:${crypto.randomUUID()}`;
  const apiUrl = "https://orma-api.nryn.dev";

  testFn("forged update without the path secret is discarded", async () => {
    const calls: string[] = [];
    const handler = createTelegramHandler({
      botToken,
      webhookSecret: secret,
      apiUrl,
      fetch: async (input) => {
        calls.push(String(input));
        throw new Error("fetch must not run for a forged update");
      },
    });
    const response = await handler(
      new Request(`${apiUrl}/functions/v1/telegram/wrong-secret`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "this is not json and must not be parsed",
      }),
    );
    if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
    if ((await response.text()) !== "") throw new Error("expected an empty body");
    if (calls.length !== 0) throw new Error("Telegram must not be called");
  });

  testFn("forged update with no path secret is discarded", async () => {
    const handler = createTelegramHandler({
      botToken,
      webhookSecret: secret,
      apiUrl,
      fetch: async () => {
        throw new Error("fetch must not run");
      },
    });
    const response = await handler(
      new Request(`${apiUrl}/functions/v1/telegram`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: startUpdate(),
      }),
    );
    if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
    if ((await response.text()) !== "") throw new Error("expected an empty body");
  });

  testFn("GET with the path secret registers the ORMA_API_URL webhook", async () => {
    let capturedUrl: string | undefined;
    const handler = createTelegramHandler({
      botToken,
      webhookSecret: secret,
      apiUrl,
      fetch: async (_input, init) => {
        const parsed = JSON.parse(String(init?.body ?? "{}")) as { url?: string };
        capturedUrl = parsed.url;
        return new Response(JSON.stringify({ ok: true, result: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    const response = await handler(new Request(`${apiUrl}/functions/v1/telegram/${secret}`));
    if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
    const expected = `${apiUrl}/functions/v1/telegram/${secret}`;
    if (capturedUrl !== expected) throw new Error("setWebhook url must use ORMA_API_URL");
    if (capturedUrl.includes("supabase.co")) throw new Error("setWebhook must not use the project host");
  });

  testFn("/start replies with the linking prompt", async () => {
    const sendBodies: string[] = [];
    const handler = createTelegramHandler({
      botToken,
      webhookSecret: secret,
      apiUrl,
      fetch: async (_input, init) => {
        sendBodies.push(typeof init?.body === "string" ? init.body : String(init?.body ?? ""));
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              message_id: 2,
              date: 2,
              chat: { id: 42, type: "private" },
              text: START_LINK_PROMPT,
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const response = await handler(
      new Request(`${apiUrl}/functions/v1/telegram/${secret}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: startUpdate(),
      }),
    );
    if (!response.ok) throw new Error(`expected grammY to accept the update, got ${response.status}`);
    const matched = sendBodies.some((body) => body.includes(START_LINK_PROMPT));
    if (!matched) throw new Error("Bot API was not asked to send the linking prompt");
  });
}
