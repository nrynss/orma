<script lang="ts">
	import { onMount } from 'svelte'
	import {
		ORMA_API_URL,
		TELEGRAM_BOT_USERNAME,
		loadTelegramLinkState,
		mintLinkToken,
		unlinkTelegram
	} from '$lib/telegram-link'
	import {
		getPublishableKey,
		getSession,
		getSupabase,
		postAuthTelegram,
		sessionTokensFromUnknown,
		type TelegramWidgetUser
	} from '$lib/supabase'

	let { data } = $props()

	let deepLink = $state('')
	let telegramChatId = $state<number | null>(null)
	let attachedTelegramId = $state<string | null>(null)
	let attachedTelegramName = $state('')
	let status = $state('')
	let error = $state('')
	let busy = $state(false)
	let widgetHost: HTMLDivElement | undefined = $state()

	function telegramIdFromUnknown(value: unknown): string | null {
		if (typeof value === 'number' && Number.isInteger(value) && value > 0) return String(value)
		if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) return value
		return null
	}

	async function creds() {
		const live = await getSession()
		const accessToken = live?.access_token ?? data.session?.access_token ?? ''
		const userId = live?.user.id ?? data.session?.user.id ?? ''
		if (!accessToken || !userId) {
			throw new Error('Sign in, then return to Settings.')
		}
		const meta = live?.user.app_metadata ?? data.session?.user.app_metadata ?? {}
		const attached = telegramIdFromUnknown(
			(meta as Record<string, unknown>).telegram_user_id
		)
		if (attached) attachedTelegramId = attached
		return {
			apiUrl: ORMA_API_URL,
			accessToken,
			userId,
			anonKey: getPublishableKey()
		}
	}

	async function refresh() {
		error = ''
		status = ''
		busy = true
		try {
			const state = await loadTelegramLinkState(await creds())
			telegramChatId = state.telegramChatId
			status = telegramChatId === null ? 'Bot chat is not linked.' : `Linked chat ${telegramChatId}.`
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not read link state'
		} finally {
			busy = false
		}
	}

	async function mint() {
		error = ''
		status = ''
		busy = true
		try {
			const minted = await mintLinkToken(await creds())
			deepLink = minted.deepLink
			status = 'Open this link in Telegram. One Start press binds this chat.'
		} catch (err) {
			error = err instanceof Error ? err.message : 'Mint failed'
		} finally {
			busy = false
		}
	}

	async function unlink() {
		error = ''
		status = ''
		busy = true
		try {
			await unlinkTelegram(await creds())
			deepLink = ''
			telegramChatId = null
			status = 'Bot chat is unlinked. Tokens and chat id are cleared. Sign-in identity stays attached.'
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unlink failed'
		} finally {
			busy = false
		}
	}

	async function attachTelegram(user: TelegramWidgetUser) {
		error = ''
		status = ''
		busy = true
		try {
			const { accessToken } = await creds()
			const payload = await postAuthTelegram(user, { accessToken })
			const tokens = sessionTokensFromUnknown(payload)
			if (!tokens) throw new Error('Telegram attach returned no session')
			const { error: setError } = await getSupabase().auth.setSession(tokens)
			if (setError) throw setError
			attachedTelegramId = String(user.id)
			attachedTelegramName = [user.first_name, user.last_name].filter(Boolean).join(' ')
			status = 'Telegram identity is attached to this account.'
		} catch (err) {
			error = err instanceof Error ? err.message : 'Telegram attach failed'
		} finally {
			busy = false
		}
	}

	onMount(() => {
		void refresh()
		const host = widgetHost
		if (!host) return
		const win = window as Window & { onTelegramAuth?: (user: TelegramWidgetUser) => void }
		win.onTelegramAuth = (user) => {
			void attachTelegram(user)
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
	<title>Telegram settings · Orma</title>
</svelte:head>

<main>
	<header>
		<h1>Telegram</h1>
		<p class="gloss">Two separate Telegram steps live on this page.</p>
	</header>

	<section class="block">
		<h2>Sign-in identity</h2>
		<p class="lede">
			Attach the Telegram Login Widget to this account. Later Continue with Telegram reaches this
			same user. This is identity, not the bot chat.
		</p>
		<div class="widget" bind:this={widgetHost}></div>
		{#if attachedTelegramId}
			<p class="status">
				Telegram identity is attached
				{#if attachedTelegramName}
					({attachedTelegramName}, id {attachedTelegramId})
				{:else}
					(id {attachedTelegramId})
				{/if}.
			</p>
		{/if}
	</section>

	<section class="block">
		<h2>Bot messages</h2>
		<p class="lede">
			Mint a short-lived Start link. One press on @{TELEGRAM_BOT_USERNAME} binds this chat so Orma
			can record thoughts you send there. A Start press is messaging, not sign-in.
		</p>

		<p class="actions">
			<button type="button" onclick={refresh} disabled={busy}>Refresh</button>
			<button type="button" onclick={mint} disabled={busy}>Mint Start link</button>
			<button type="button" onclick={unlink} disabled={busy}>Unlink bot chat</button>
		</p>

		{#if deepLink}
			<p>
				<a href={deepLink}>{deepLink}</a>
			</p>
		{/if}
	</section>

	{#if status}
		<p class="status">{status}</p>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}
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
		max-width: 34rem;
		margin: 0 auto;
		padding: 4rem 1.5rem 6rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	h1 {
		font-size: 2rem;
		margin: 0;
	}
	h2 {
		font-size: 1.2rem;
		margin: 0 0 0.5rem;
	}
	.gloss,
	.status {
		color: light-dark(#7a746a, #938c80);
	}
	.lede {
		margin: 0 0 0.75rem;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.error {
		color: light-dark(#8a2b2b, #e08a8a);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	button {
		font: inherit;
		padding: 0.4rem 0.8rem;
	}
	a {
		color: light-dark(#7a5283, #cfa7d8);
	}
	.widget {
		min-height: 44px;
	}
</style>
