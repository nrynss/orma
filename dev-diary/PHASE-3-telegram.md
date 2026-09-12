# P3: Telegram

```yaml
id:       P3
size:     M
requires: [T1.1, T1.2]
blocks:   [P7, P8]
parallel: [P2, P4, P5, P6]
```

**Goal:** Capture a thought the moment it happens, by text or by voice, and deliver receipts. Never ask for anything.

**Why it matters:** The call fixes review. Telegram fixes capture. It is also the only inbound surface that works from a phone with no browser, and the Start press is what makes the bot able to message a user at all.

---

### T3.1: Bot registration and webhook
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/telegram/index.ts, supabase/config.toml ([functions.telegram])
status:     done
```
Register the bot, set the webhook to the function URL with `TELEGRAM_WEBHOOK_SECRET` in the path, and stand up grammY on Deno.

Verify the secret on every update before parsing anything. An unverified update is discarded without a reply.

**Done when:** a message to the bot reaches the function, an update forged without the secret is rejected, and the bot answers `/start` with the linking prompt from T3.5.

---

### T3.2: Text capture
```yaml
requires:   T1.1, T3.1, T3.5
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/telegram/capture.ts
status:     done
```
A plain message becomes an item with `source = 'telegram'`, and the bot replies with exactly what it recorded so a misheard thought is caught immediately.

A message from a chat with no linked profile gets the linking prompt instead, never a silent drop.

**Done when:** a message creates one item under the right user, the reply quotes the recorded text, and an unlinked chat is prompted rather than ignored.

---

### T3.3: Voice capture with Gemini ★
```yaml
requires:   T3.2
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/telegram/voice.ts (+ voice_rest/telegram/vertex + voice_tests*)
status:     done
```
Impulse capture is the case where talking is the only reason the thought gets recorded at all, so this path has to feel instant.

Acknowledge first, before any work starts. Then download the Opus file from Telegram, send it to Gemini API, and edit the original message in place with the transcribed text and a confirm control.

The bot never goes silent while a model runs. A voice note that goes quiet for eight seconds reads as broken.

Store the audio in Supabase Storage against the item, so the capture has evidence in the same way a call does.

**Done when:** a voice note is acknowledged within a second, the message edits itself with the transcript, the item carries a link to the stored audio, and a failed transcription leaves a message a human can act on rather than an error.

---

### T3.4: Receipt delivery
```yaml
requires:   T1.1, T3.1
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/_shared/deliver-telegram.ts
status:     done
```
The outbound half. Telegram carries the post-call summary, what was captured and retired, and the pattern report. It never asks for anything and never chases.

Every send writes a `deliveries` row before the attempt and records the outcome after, so a failed receipt is visible rather than lost.

Respect `profiles.telegram_receipts`.

**Done when:** a completed run from fixtures produces a summary naming what was captured and retired, a `deliveries` row records the outcome, and a user with receipts disabled gets nothing.

---

### T3.5: Start press and account linking
```yaml
requires:   T1.1, T3.1
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/telegram/link.ts
status:     done
```
A bot cannot message a user who has never messaged it, so the Start press is a product requirement rather than a nicety.

Linking runs in one direction only: the web app issues a short-lived single-use token, the user opens the bot with it as a deep-link payload, and the function binds `telegram_chat_id` to that profile.

A chat id already bound to another profile is refused. A token is consumed on first use and expires quickly.

**Done when:** a fresh link binds the chat, a replayed token is refused, a token older than its window is refused, and unlinking from settings clears the binding on both sides.
