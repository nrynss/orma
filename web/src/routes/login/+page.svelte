<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { TELEGRAM_BOT_USERNAME } from '$lib/telegram-link'
	import {
		getOrmaApiUrl,
		getPublishableKey,
		getSupabase,
		LOGIN_CALLBACK_URL,
		sessionTokensFromUnknown
	} from '$lib/supabase'
	import { lookupProfileExists, postAuthPath } from '../app/onboarding/profile-gate'

	type TelegramWidgetUser = {
		id: number
		first_name: string
		last_name?: string
		username?: string
		photo_url?: string
		auth_date: number
		hash: string
	}

	let email = $state('')
	let status = $state('')
	let error = $state('')
	let busy = $state(false)
	let widgetHost: HTMLDivElement | undefined = $state()

	async function sendLink(event: Event) {
		event.preventDefault()
		error = ''
		status = ''
		const address = email.trim()
		if (!address) {
			error = 'Enter an email address.'
			return
		}
		busy = true
		try {
			const { error: otpError } = await getSupabase().auth.signInWithOtp({
				email: address,
				options: {
					emailRedirectTo: LOGIN_CALLBACK_URL,
					shouldCreateUser: true
				}
			})
			if (otpError) throw otpError
			status = 'Check your email for the sign-in link.'
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not send the sign-in link'
		} finally {
			busy = false
		}
	}

	async function completeTelegram(user: TelegramWidgetUser) {
		error = ''
		status = ''
		busy = true
		try {
			const api = getOrmaApiUrl()
			const key = getPublishableKey()
			const response = await fetch(`${api}/functions/v1/auth-telegram`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					apikey: key,
					authorization: `Bearer ${key}`
				},
				body: JSON.stringify(user)
			})
			const text = await response.text()
			if (!response.ok) {
				throw new Error(text || `Telegram sign-in failed (${response.status})`)
			}
			let payload: unknown = null
			try {
				payload = text ? JSON.parse(text) : null
			} catch {
				throw new Error('Telegram sign-in returned invalid JSON')
			}
			const tokens = sessionTokensFromUnknown(payload)
			if (!tokens) {
				throw new Error('Telegram sign-in returned no session')
			}
			const { error: setError } = await getSupabase().auth.setSession(tokens)
			if (setError) throw setError
			const { data: userData } = await getSupabase().auth.getUser()
			const userId = userData.user?.id
			if (!userId) throw new Error('Telegram sign-in returned no user')
			const hasProfile = await lookupProfileExists({
				apiUrl: getOrmaApiUrl(),
				anonKey: getPublishableKey(),
				accessToken: tokens.access_token,
				userId
			})
			await goto(postAuthPath(hasProfile))
		} catch (err) {
			error = err instanceof Error ? err.message : 'Telegram sign-in failed'
		} finally {
			busy = false
		}
	}

	onMount(() => {
		const host = widgetHost
		if (!host) return
		const win = window as Window & { onTelegramAuth?: (user: TelegramWidgetUser) => void }
		win.onTelegramAuth = (user) => {
			void completeTelegram(user)
		}
		const script = document.createElement('script')
		script.async = true
		script.src = 'https://telegram.org/js/telegram-widget.js?22'
		script.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME)
		script.setAttribute('data-size', 'large')
		script.setAttribute('data-radius', 'true')
		script.setAttribute('data-request-access', 'write')
		script.setAttribute('data-onauth', 'onTelegramAuth(user)')
		host.replaceChildren(script)
		return () => {
			win.onTelegramAuth = undefined
			host.replaceChildren()
		}
	})
</script>

<svelte:head>
	<title>Sign in · Orma</title>
</svelte:head>

<main>
	<header>
		<h1>Orma</h1>
		<p class="gloss">ഓർമ്മ — it remembers what you keep not doing.</p>
	</header>

	<p class="lede">Sign in to set up your daily call.</p>

	<form class="stack" onsubmit={sendLink}>
		<label class="field">
			<span class="field-label">Email</span>
			<input
				class="input"
				type="email"
				name="email"
				autocomplete="email"
				bind:value={email}
				placeholder="you@example.com"
				required
			/>
		</label>
		<button class="btn btn-primary" type="submit" disabled={busy}>Email me a sign-in link</button>
		<p class="hint">No password. The link signs you in on this device.</p>
	</form>

	<div class="divider">
		<span class="hair"></span>
		<span class="or">or</span>
		<span class="hair"></span>
	</div>

	<div class="stack">
		<p class="field-label">Continue with Telegram</p>
		<div class="widget" bind:this={widgetHost}></div>
		<p class="hint">Orma sees your Telegram name and id. Never your messages.</p>
	</div>

	{#if status}
		<p class="status">{status}</p>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}

	<p class="foot-hint">Both ways reach the same account.</p>
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
		padding: 3rem 1.5rem 6rem;
		display: flex;
		flex-direction: column;
		gap: 2.25rem;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	h1 {
		font-size: 2.5rem;
		margin: 0;
		letter-spacing: -0.02em;
		font-weight: 600;
		line-height: 1.1;
	}
	.gloss {
		margin: 0;
		color: light-dark(#7a746a, #938c80);
		font-size: 0.95rem;
	}
	.lede {
		margin: 0;
		font-size: 1.2rem;
		line-height: 1.5;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.field-label {
		font-size: 0.95rem;
		font-weight: 600;
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
	.btn {
		font: inherit;
		font-size: 0.95rem;
		font-weight: 500;
		min-height: 44px;
		padding: 0 1.1rem;
		border-radius: 4px;
		border: 1px solid transparent;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-primary {
		background: light-dark(#7a5283, #cfa7d8);
		color: light-dark(#fbfaf8, #14130f);
	}
	.hint,
	.status,
	.or {
		color: light-dark(#7a746a, #938c80);
	}
	.hint {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.status,
	.error {
		margin: 0;
	}
	.error {
		color: light-dark(#8a2b2b, #e08a8a);
	}
	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.hair {
		flex: 1;
		border-top: 1px solid light-dark(#e6e1d7, #2a2620);
	}
	.or {
		font-size: 0.85rem;
	}
	.widget {
		min-height: 44px;
	}
	.foot-hint {
		margin: 0;
		padding-top: 1.5rem;
		border-top: 1px solid light-dark(#e6e1d7, #2a2620);
		font-size: 0.9rem;
		color: light-dark(#7a746a, #938c80);
	}
</style>
