<script lang="ts">
	import {
		ORMA_API_URL,
		TELEGRAM_BOT_USERNAME,
		loadTelegramLinkState,
		mintLinkToken,
		unlinkTelegram
	} from '$lib/telegram-link'

	let userId = $state('')
	let accessToken = $state('')
	let deepLink = $state('')
	let telegramChatId = $state<number | null>(null)
	let status = $state('')
	let error = $state('')
	let busy = $state(false)

	function client() {
		return {
			apiUrl: ORMA_API_URL,
			accessToken: accessToken.trim(),
			userId: userId.trim()
		}
	}

	async function refresh() {
		error = ''
		status = ''
		if (!userId.trim() || !accessToken.trim()) {
			status = 'T5.3 auth shell is not landed. Enter a signed-in user id and JWT to mint or unlink.'
			return
		}
		busy = true
		try {
			const state = await loadTelegramLinkState(client())
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
		if (!userId.trim() || !accessToken.trim()) {
			error = 'Sign in through T5.3, then return with a session JWT.'
			return
		}
		busy = true
		try {
			const minted = await mintLinkToken(client())
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
		if (!userId.trim() || !accessToken.trim()) {
			error = 'Sign in through T5.3, then return with a session JWT.'
			return
		}
		busy = true
		try {
			await unlinkTelegram(client())
			deepLink = ''
			telegramChatId = null
			status = 'Telegram is unlinked. Tokens and chat id are cleared.'
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unlink failed'
		} finally {
			busy = false
		}
	}
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

	<p class="note">
		T5.3 owns the session client. Until that lands, paste the signed-in user id and JWT from a
		working session. Helpers talk to {ORMA_API_URL} only.
	</p>

	<label>
		User id
		<input bind:value={userId} autocomplete="off" />
	</label>
	<label>
		Access token
		<input type="password" bind:value={accessToken} autocomplete="off" />
	</label>

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
	.note,
	.status {
		color: light-dark(#7a746a, #938c80);
	}
	.error {
		color: light-dark(#8a2b2b, #e08a8a);
	}
	label {
		display: block;
		margin: 1rem 0;
	}
	input {
		display: block;
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.4rem 0.5rem;
		box-sizing: border-box;
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
</style>
