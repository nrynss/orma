<script lang="ts">
	import { goto } from '$app/navigation'
	import { onMount } from 'svelte'
	import { getSupabase } from '$lib/supabase'

	let { data } = $props()
	let message = $state('Signing you in.')

	onMount(async () => {
		if (data.error) {
			message = data.error
			return
		}
		const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
		const params = new URLSearchParams(hash)
		const accessToken = params.get('access_token')
		const refreshToken = params.get('refresh_token')
		if (accessToken && refreshToken) {
			const { error } = await getSupabase().auth.setSession({
				access_token: accessToken,
				refresh_token: refreshToken
			})
			if (error) {
				message = error.message
				return
			}
			window.history.replaceState(null, '', window.location.pathname)
			await goto('/app/settings', { replaceState: true })
			return
		}
		if (!window.location.search.includes('code=') && !window.location.search.includes('token_hash=')) {
			message = 'This sign-in link is missing its token. Request a new one.'
		}
	})
</script>

<svelte:head>
	<title>Signing in · Orma</title>
</svelte:head>

<main>
	<h1>Orma</h1>
	<p class="status">{message}</p>
	<p><a href="/login">Back to sign in</a></p>
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
		padding: 4rem 1.5rem 6rem;
	}
	h1 {
		font-size: 2rem;
		margin: 0 0 1rem;
	}
	.status {
		color: light-dark(#7a746a, #938c80);
	}
	a {
		color: light-dark(#7a5283, #cfa7d8);
	}
</style>
