<script lang="ts">
	import '$lib/ui/tokens.css'
	import { goto, invalidate } from '$app/navigation'
	import { page } from '$app/state'
	import { getSupabase } from '$lib/supabase'
	import { AppNav } from '$lib/ui'
	import { isOnboardingPath } from './onboarding/profile-gate'

	let { data, children } = $props()

	let displayName = $state('')
	const onboarding = $derived(isOnboardingPath(page.url.pathname))

	$effect(() => {
		const userId = data.session?.user.id
		if (!userId || onboarding) return
		let stale = false
		void getSupabase()
			.from('profiles')
			.select('display_name')
			.eq('id', userId)
			.maybeSingle()
			.then(({ data: row }) => {
				if (!stale) displayName = row?.display_name ?? ''
			})
		return () => {
			stale = true
		}
	})

	async function signOut() {
		await getSupabase().auth.signOut()
		await invalidate('supabase:auth')
		await goto('/')
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&family=Source+Code+Pro:wght@400;500&display=swap"
	/>
</svelte:head>

{#if onboarding}
	<div class="o-app simple">
		<header class="o-row simple-head">
			<a class="wordmark" href="/">Orma</a>
			{#if data.session}
				<button type="button" class="o-link-button small" onclick={signOut}>Sign out</button>
			{/if}
		</header>
		{@render children()}
	</div>
{:else}
	<div class="o-app shell">
		<aside class="side">
			<div class="o-row brand">
				<div class="o-stack">
					<a class="wordmark" href="/app">Orma</a>
					<p class="o-gloss tagline">ഓർമ്മ · it remembers</p>
				</div>
				<div class="o-row who-top">
					<span class="o-muted name">{displayName}</span>
					<button type="button" class="o-link-button small" onclick={signOut}>Sign out</button>
				</div>
			</div>
			<AppNav path={page.url.pathname} />
			<div class="o-stack who">
				<span class="name-side">{displayName}</span>
				<button type="button" class="o-link-button small" onclick={signOut}>Sign out</button>
			</div>
		</aside>
		<div class="content">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.wordmark {
		font-size: 1.35rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		text-decoration: none;
	}
	.o-app .wordmark {
		color: var(--o-ink);
	}
	.small {
		font-size: 0.85rem;
	}
	.simple-head {
		justify-content: space-between;
		max-width: 24rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1.25rem 1.5rem 0;
	}
	.brand {
		justify-content: space-between;
		gap: 1rem;
	}
	.tagline {
		display: none;
	}
	.who-top {
		gap: 0.75rem;
	}
	.name {
		font-size: 0.85rem;
	}
	.who {
		display: none;
	}
	@media (min-width: 900px) {
		.shell {
			display: grid;
			grid-template-columns: 248px minmax(0, 1fr);
		}
		.side {
			border-right: 1px solid var(--o-hair);
			padding: 2.5rem 1.25rem;
			gap: 2rem;
			min-height: 100vh;
			position: sticky;
			top: 0;
			align-self: start;
		}
		.brand {
			padding: 0 0.75rem;
		}
		.wordmark {
			font-size: 1.6rem;
			letter-spacing: -0.02em;
		}
		.tagline {
			display: block;
			font-size: 0.85rem;
		}
		.who-top {
			display: none;
		}
		.who {
			display: flex;
			margin-top: auto;
			padding: 0 0.75rem;
			align-items: flex-start;
		}
		.name-side {
			font-size: 0.9rem;
		}
	}
</style>
