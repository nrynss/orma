<script lang="ts">
	import { APP_NAV, isCurrentNav } from './nav'

	let { path }: { path: string } = $props()
</script>

<nav class="app-nav" aria-label="App">
	{#each APP_NAV as link (link.href)}
		{@const current = isCurrentNav(path, link.href)}
		<a href={link.href} class:on={current} aria-current={current ? 'page' : undefined}>{link.label}</a>
	{/each}
</nav>

<style>
	.app-nav {
		display: flex;
		gap: 1.25rem;
		overflow-x: auto;
		white-space: nowrap;
		font-size: 0.95rem;
		border-bottom: 1px solid var(--o-hair);
		scrollbar-width: none;
	}
	.app-nav a {
		color: var(--o-ink);
		text-decoration: none;
		min-height: 44px;
		display: flex;
		align-items: center;
		padding: 0 0.1rem;
		border-bottom: 2px solid transparent;
	}
	.app-nav a.on {
		color: var(--o-plum);
		font-weight: 600;
		border-bottom-color: var(--o-plum);
	}
	@media (min-width: 900px) {
		.app-nav {
			flex-direction: column;
			gap: 0.1rem;
			border-bottom: 0;
			overflow: visible;
		}
		.app-nav a {
			padding: 0 0.75rem;
			border-radius: 4px;
			border-bottom: 0;
		}
		.app-nav a.on {
			background: var(--o-wash);
		}
	}
</style>
