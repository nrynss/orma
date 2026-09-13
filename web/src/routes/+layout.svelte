<script lang="ts">
	import { goto, invalidate } from '$app/navigation'
	import { page } from '$app/state'
	import { onMount } from 'svelte'
	import favicon from '$lib/assets/favicon.svg'
	import { getSupabase } from '$lib/supabase'

	let { data, children } = $props()

	onMount(() => {
		const supabase = getSupabase()
		const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
			const now = session?.user.id ?? null
			const was = data.session?.user.id ?? null
			if (now !== was) void invalidate('supabase:auth')
		})
		return () => listener.subscription.unsubscribe()
	})

	async function signOut() {
		await getSupabase().auth.signOut()
		await invalidate('supabase:auth')
		await goto('/')
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav class="shell-bar">
	<a href="/">Orma</a>
	<span class="shell-actions">
		{#if data.session}
			<a href="/app/settings">Settings</a>
			<button type="button" onclick={signOut}>Sign out</button>
		{:else if !page.url.pathname.startsWith('/login')}
			<a href="/login">Sign in</a>
		{/if}
	</span>
</nav>

{@render children()}

<style>
	.shell-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		font: 16px/1.6 ui-serif, Georgia, 'Times New Roman', serif;
		color: light-dark(#22201c, #e8e4dc);
	}
	.shell-bar a {
		color: inherit;
		text-decoration: none;
	}
	.shell-bar a:hover {
		color: light-dark(#7a5283, #cfa7d8);
	}
	.shell-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.shell-actions button {
		font: inherit;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.shell-actions button:hover {
		color: light-dark(#7a5283, #cfa7d8);
	}
</style>
