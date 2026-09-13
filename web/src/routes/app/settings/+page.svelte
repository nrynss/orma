<script lang="ts">
	import { onMount } from 'svelte'
	import {
		ORMA_API_URL,
		TELEGRAM_BOT_USERNAME,
		loadTelegramLinkState,
		mintLinkToken,
		unlinkTelegram
	} from '$lib/telegram-link'
	import { getPublishableKey, getSession } from '$lib/supabase'

	let { data } = $props()

	let deepLink = $state('')
	let telegramChatId = $state<number | null>(null)
	let status = $state('')
	let error = $state('')
	let busy = $state(false)

	async function creds() {
		const live = await getSession()
		const accessToken = live?.access_token ?? data.session?.access_token ?? ''
		const userId = live?.user.id ?? data.session?.user.id ?? ''
		if (!accessToken || !userId) {
			throw new Error('Sign in, then return to Settings.')
		}
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
			status = telegramChatId === null ? 'Telegram is not linked.' : `Linked chat ${telegramChatId}.`
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
			status = 'Telegram is unlinked. Tokens and chat id are cleared.'
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unlink failed'
		} finally {
			busy = false
		}
	}

	onMount(() => {
		void refresh()
	})
</script>

<svelte:head>
	<title>Telegram settings · Orma</title>
</svelte:head>

<main>
	<header>
		<h1>Telegram</h1>
		<p class="gloss">Link @{TELEGRAM_BOT_USERNAME} to this Orma account.</p>
	</header>

	<p class="lede">
		The web app mints a short-lived token. You open the bot with that token. Orma then records
		thoughts you send in that chat.
	</p>

	<p class="actions">
		<button type="button" onclick={refresh} disabled={busy}>Refresh</button>
		<button type="button" onclick={mint} disabled={busy}>Mint Start link</button>
		<button type="button" onclick={unlink} disabled={busy}>Unlink Telegram</button>
	</p>

	{#if status}
		<p class="status">{status}</p>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}
	{#if deepLink}
		<p>
			<a href={deepLink}>{deepLink}</a>
		</p>
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
	}
	h1 {
		font-size: 2rem;
		margin: 0;
	}
	.gloss,
	.status {
		color: light-dark(#7a746a, #938c80);
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
</style>
