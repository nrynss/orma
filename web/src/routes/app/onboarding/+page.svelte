<script lang="ts">
	import { goto } from '$app/navigation'
	import { TELEGRAM_BOT_USERNAME } from '$lib/telegram-link'
	import { getOrmaApiUrl, getPublishableKey, getSession } from '$lib/supabase'
	import {
		ALL_WEEKDAYS,
		DEFAULT_TIMEZONE,
		WEEKDAY_CHIPS,
		firstCallSummary,
		isE164,
		normalizePhone,
		shownConsentWording
	} from './model'
	import { submitOnboarding } from './submit'

	let { data } = $props()

	let displayName = $state('')
	let phone = $state('')
	let agreed = $state(false)
	let localTime = $state('08:00')
	let weekdays = $state<number[]>([...ALL_WEEKDAYS])
	let timeZone = $state(DEFAULT_TIMEZONE)
	let busy = $state(false)
	let error = $state('')

	const timeZones = listTimeZones()
	const phoneE164 = $derived(normalizePhone(phone))
	const phoneOk = $derived(isE164(phone))
	const consentWording = $derived(shownConsentWording(phoneOk ? phoneE164 : 'your number'))
	const callSummary = $derived(
		firstCallSummary({
			localTime,
			weekdays,
			timeZone
		})
	)

	function listTimeZones(): string[] {
		try {
			const zones = [...Intl.supportedValuesOf('timeZone')]
			if (!zones.includes(DEFAULT_TIMEZONE)) zones.unshift(DEFAULT_TIMEZONE)
			return zones
		} catch {
			return [
				DEFAULT_TIMEZONE,
				'UTC',
				'Europe/London',
				'Europe/Paris',
				'America/New_York',
				'America/Chicago',
				'America/Denver',
				'America/Los_Angeles',
				'America/Sao_Paulo',
				'Africa/Johannesburg',
				'Asia/Dubai',
				'Asia/Singapore',
				'Asia/Tokyo',
				'Australia/Sydney',
				'Pacific/Auckland'
			]
		}
	}

	function toggleDay(day: number) {
		if (weekdays.includes(day)) {
			if (weekdays.length === 1) return
			weekdays = weekdays.filter((n) => n !== day)
			return
		}
		weekdays = [...weekdays, day].sort((a, b) => a - b)
	}

	async function startCalls(event: Event) {
		event.preventDefault()
		error = ''
		busy = true
		try {
			const live = await getSession()
			const accessToken = live?.access_token ?? data.session?.access_token ?? ''
			const userId = live?.user.id ?? data.session?.user.id ?? ''
			if (!accessToken || !userId) {
				throw new Error('Sign in, then return to onboarding.')
			}
			await submitOnboarding(
				{
					apiUrl: getOrmaApiUrl(),
					accessToken,
					userId,
					anonKey: getPublishableKey()
				},
				{
					displayName,
					phone,
					agreed,
					localTime,
					weekdays,
					timeZone
				}
			)
			await goto('/app/settings')
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save onboarding'
		} finally {
			busy = false
		}
	}
</script>

<svelte:head>
	<title>Set up your call · Orma</title>
</svelte:head>

<main>
	<header>
		<h1>Set up your call</h1>
		<p class="gloss">Six short steps, once.</p>
	</header>

	<form class="flow" onsubmit={startCalls}>
		<section class="step">
			<div class="step-head">
				<span class="mono muted">1</span>
				<h2>Your name</h2>
			</div>
			<label class="field">
				<span class="sr-only">Your name</span>
				<input
					class="input"
					type="text"
					name="display_name"
					autocomplete="name"
					bind:value={displayName}
					required
				/>
				<span class="hint">Orma says it when it calls, so you know who it is for.</span>
			</label>
		</section>

		<section class="step">
			<div class="step-head">
				<span class="mono muted">2</span>
				<h2>Your phone</h2>
			</div>
			<label class="field">
				<span class="sr-only">Phone number</span>
				<input
					class="input"
					class:bad={phone.length > 0 && !phoneOk}
					type="tel"
					name="phone"
					inputmode="tel"
					autocomplete="tel"
					placeholder="+91 98765 43210"
					bind:value={phone}
					required
				/>
				<span class="hint">
					In international format, starting with +. Orma has no text messages, so it cannot check
					this number. Your first call confirms it. The number is self-declared. Saving still sets
					the confirmed timestamp, because the dispatcher will not place that first call without
					it.
				</span>
			</label>
		</section>

		<section class="step">
			<div class="step-head">
				<span class="mono muted">3</span>
				<h2>Your consent</h2>
			</div>
			<div class="wash">
				<span class="label">Wording v1</span>
				<p>{consentWording}</p>
			</div>
			<div class="actions">
				<button
					class="btn"
					class:btn-primary={agreed}
					class:btn-secondary={!agreed}
					type="button"
					aria-pressed={agreed}
					onclick={() => (agreed = true)}
				>
					I agree to these calls
				</button>
				<button class="btn btn-text" type="button" onclick={() => (agreed = false)}>
					Continue without agreeing
				</button>
			</div>
			<p class="hint">Without this, Orma will not call. You can agree later in Settings.</p>
		</section>

		<section class="step">
			<div class="step-head">
				<span class="mono muted">4</span>
				<h2>When to call</h2>
			</div>
			<label class="field">
				<span class="field-label">Time</span>
				<input class="input" type="time" name="local_time" bind:value={localTime} required />
			</label>
			<div class="field">
				<span class="field-label">Days</span>
				<div class="days">
					{#each WEEKDAY_CHIPS as day (day.n)}
						<button
							class="day"
							class:on={weekdays.includes(day.n)}
							type="button"
							aria-pressed={weekdays.includes(day.n)}
							onclick={() => toggleDay(day.n)}
						>
							{day.label}
						</button>
					{/each}
				</div>
			</div>
			<label class="field">
				<span class="field-label">Time zone</span>
				<select class="input" name="timezone" bind:value={timeZone}>
					{#each timeZones as zone (zone)}
						<option value={zone}>{zone}</option>
					{/each}
				</select>
			</label>
		</section>

		<section class="step">
			<div class="step-head">
				<span class="mono muted">5</span>
				<h2>Receipts on Telegram</h2>
			</div>
			<p>After each call, Orma can send what it captured. One Start press lets the bot message you.</p>
			<a class="btn btn-secondary telegram" href="https://t.me/{TELEGRAM_BOT_USERNAME}">
				<svg
					width="18"
					height="18"
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M17.5 2.5L9 11"></path>
					<path d="M17.5 2.5L12 17.5l-3-6.5-6.5-3z"></path>
				</svg>
				Open @{TELEGRAM_BOT_USERNAME}
			</a>
			<p class="hint">
				Optional. Receipts only, never reminders. After you start, Settings can mint a Start link.
			</p>
		</section>

		<section class="step">
			<div class="step-head">
				<span class="mono muted">6</span>
				<h2>Before the first call</h2>
			</div>
			<div class="wash">
				<p class="warn-title">It will come from a number you won't recognise.</p>
				<p>
					A different one each time, and your phone may say it is likely spam. Answer it anyway. It
					is Orma.
				</p>
				<p class="hint">We cannot stop that warning, and there is no number to save.</p>
			</div>
		</section>

		<section class="close">
			<p>{callSummary}</p>
			<button class="btn btn-primary start" type="submit" disabled={busy}>Start my calls</button>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</section>
	</form>
</main>

<style>
	:global(html) {
		color-scheme: light dark;
	}
	:global(body) {
		margin: 0;
		background: light-dark(#fbfaf8, #14130f);
		color: light-dark(#22201c, #e8e4dc);
		font: 16px/1.6 ui-serif, Georgia, 'Times New Roman', serif;
	}
	main {
		max-width: 24rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h1 {
		font-size: 2rem;
		line-height: 1.15;
		margin: 0;
		letter-spacing: -0.01em;
		font-weight: 600;
	}
	h2 {
		font-size: 1.15rem;
		margin: 0;
		font-weight: 600;
	}
	.gloss {
		margin: 0;
		color: light-dark(#716b61, #938c80);
		font-size: 0.95rem;
	}
	.flow {
		display: flex;
		flex-direction: column;
	}
	.step,
	.close {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.5rem 0 0;
		border-top: 1px solid light-dark(#e6e1d7, #2a2620);
	}
	.step-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.mono {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
		font-size: 0.8rem;
	}
	.muted {
		color: light-dark(#716b61, #938c80);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.field-label,
	.label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: light-dark(#716b61, #938c80);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.input {
		font: inherit;
		min-height: 44px;
		padding: 0 0.75rem;
		border: 1px solid light-dark(#948f83, #6e685e);
		border-radius: 4px;
		background: light-dark(#fbfaf8, #14130f);
		color: inherit;
		box-sizing: border-box;
		width: 100%;
	}
	.input:focus {
		outline: 2px solid light-dark(#7a5283, #cfa7d8);
		outline-offset: 2px;
	}
	.input.bad {
		border-color: light-dark(#8a2b2b, #e08a8a);
	}
	.hint {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: light-dark(#716b61, #938c80);
	}
	.wash {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: 6px;
		background: light-dark(#f6ecf8, #271e29);
	}
	.wash p {
		margin: 0;
		font-size: 0.97rem;
	}
	.warn-title {
		font-weight: 600;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.btn {
		font: inherit;
		font-size: 0.95rem;
		font-weight: 500;
		min-height: 44px;
		padding: 0 1.1rem;
		border-radius: 4px;
		border: 1px solid transparent;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
		box-sizing: border-box;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-primary {
		background: light-dark(#7a5283, #cfa7d8);
		color: light-dark(#fbfaf8, #14130f);
	}
	.btn-secondary {
		background: transparent;
		border-color: light-dark(#948f83, #6e685e);
	}
	.btn-text {
		background: transparent;
		color: light-dark(#7a5283, #cfa7d8);
		padding: 0 0.5rem;
	}
	.telegram {
		align-self: flex-start;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.day {
		font: inherit;
		min-width: 44px;
		min-height: 44px;
		border-radius: 4px;
		border: 1px solid light-dark(#948f83, #6e685e);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.day.on {
		background: light-dark(#7a5283, #cfa7d8);
		border-color: transparent;
		color: light-dark(#fbfaf8, #14130f);
	}
	.close p {
		margin: 0;
	}
	.start {
		width: 100%;
	}
	.error {
		margin: 0;
		color: light-dark(#8a2b2b, #e08a8a);
	}
</style>
