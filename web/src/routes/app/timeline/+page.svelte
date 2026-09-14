<script lang="ts">
	import { invalidate } from '$app/navigation'
	import { page } from '$app/state'
	import { formatClock, formatDayLabel } from '$lib/today/model'
	import {
		glossFor,
		groupByRun,
		isLiveState,
		maskPhones,
		pickDefaultRunId,
		sortSteps,
		stoppedRuns,
		type TimelineEvent,
		type TimelineRun
	} from './model'

	let { data } = $props()

	const FALLBACK_ZONE = 'Asia/Kolkata'
	let openSteps = $state<Set<number>>(new Set())
	let refreshing = $state(false)

	const rows = $derived(data.rows)
	const zone = $derived(rows?.timezone || FALLBACK_ZONE)
	const runs = $derived(rows?.runs ?? [])
	const byRun = $derived.by(() => groupByRun(rows?.events ?? [], runs.map((run) => run.id)))
	const defaultId = $derived(pickDefaultRunId(runs, byRun))
	const requestedId = $derived(page.url.searchParams.get('run'))
	const selected = $derived(
		runs.find((run) => run.id === requestedId) ?? runs.find((run) => run.id === defaultId) ?? null
	)
	const steps = $derived(sortSteps(selected ? (byRun.get(selected.id) ?? []) : []))
	const stopped = $derived(stoppedRuns(runs, byRun))
	const live = $derived(selected ? isLiveState(selected.state) : false)

	function runTitle(run: TimelineRun): string {
		return `${formatDayLabel(run.scheduled_for, zone)}, ${formatClock(run.scheduled_for, zone)}`
	}

	function toggle(id: number) {
		const next = new Set(openSteps)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		openSteps = next
	}

	function detailText(event: TimelineEvent): string {
		return maskPhones(JSON.stringify(event.detail ?? {}, null, 2))
	}

	async function refresh() {
		refreshing = true
		try {
			await invalidate('orma:timeline')
		} finally {
			refreshing = false
		}
	}
</script>

<svelte:head><title>Timeline · Orma</title></svelte:head>

<main class="timeline">
	{#if data.error || !rows}
		<section class="o-stack head"><h1 class="o-h1">Timeline</h1><p class="o-hint" role="alert">{data.error || 'Could not load your timeline.'}</p></section>
	{:else if runs.length === 0}
		<section class="o-stack head">
			<h1 class="o-h1">Timeline</h1>
			<p class="o-gloss">What happened to each call, step by step. Only your own runs.</p>
			<p class="o-hint">No runs yet. Your timeline appears after the first call is scheduled.</p>
		</section>
	{:else if !selected}
		<section class="o-stack head"><h1 class="o-h1">Timeline</h1><p class="o-hint" role="alert">That run is not on your timeline.</p></section>
	{:else}
		<section class="o-stack head">
			<h1 class="o-h1">Timeline</h1>
			<p class="o-gloss">What happened to each call, step by step. Only your own runs.</p>
		</section>

		<section class="o-stack picker">
			<h2 class="o-h2">Runs, newest first</h2>
			<ul>
				{#each runs as run (run.id)}
					<li>
						<a href="?run={run.id}" aria-current={run.id === selected.id ? 'true' : undefined}>
							{runTitle(run)} · {run.state}{#if (byRun.get(run.id)?.length ?? 0) === 0} · no steps yet{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>

		<section class="o-stack run">
			<div class="run-head">
				<h2 class="run-title">{runTitle(selected)}</h2>
				<div class="o-row tags">
					<span class="o-tag">{selected.state}</span>
					{#if live}<span class="o-tag live">live</span>{/if}
					{#if selected.dry_run}<span class="o-tag">rehearsal</span>{/if}
				</div>
			</div>
			{#if live}
				<p class="o-hint">New steps appear as they happen.</p>
				<div><button class="o-btn o-btn-secondary" onclick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
			{/if}
			{#if steps.length === 0}
				<p class="o-hint">No steps recorded for this run yet.</p>
			{:else}
				<div class="o-stack steps">
					{#each steps as event (event.id)}
						<div class="step">
							<span class="o-mono o-muted clock">{formatClock(event.at, zone, true)}</span>
							<div class="o-stack body">
								<span class="o-mono kind">{event.kind}</span>
								<span class="gloss">{glossFor(event.kind, event.detail, (iso) => formatClock(iso, zone))}</span>
								{#if openSteps.has(event.id)}
									<pre class="o-mono payload">{detailText(event)}</pre>
								{/if}
							</div>
							<button
								class="o-btn o-btn-text toggle"
								onclick={() => toggle(event.id)}
								aria-expanded={openSteps.has(event.id)}
								aria-label={openSteps.has(event.id) ? `Hide detail for ${event.kind}` : `Show detail for ${event.kind}`}
							>{openSteps.has(event.id) ? 'Hide' : 'Show'}</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		{#if stopped.length > 0}
			<section class="o-stack stopped">
				<h2 class="o-h2">A run that stopped</h2>
				{#each stopped as entry (entry.run.id)}
					<div class="stop-row">
						<span class="o-mono o-muted">{formatDayLabel(entry.run.scheduled_for, zone)}</span>
						<div class="o-stack">
							<a class="o-mono" href="?run={entry.run.id}">{entry.run.state}</a>
							<span class="gloss">Stopped{entry.lastKind ? ` at ${entry.lastKind}` : ''}.</span>
						</div>
					</div>
				{/each}
			</section>
		{/if}
	{/if}
</main>

<style>
	.timeline { max-width: 38rem; padding: 1.75rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 2.5rem; }
	.head, .picker, .run, .stopped { gap: 1rem; }
	.picker ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
	.picker li { border-top: 1px solid var(--o-hair); }
	.picker a { display: flex; align-items: center; min-height: 44px; text-decoration: none; }
	.picker a[aria-current='true'] { font-weight: 600; }
	.run-head { display: flex; flex-direction: column; gap: 0.5rem; }
	.run-title { font-size: 1.2rem; line-height: 1.4; margin: 0; font-weight: 600; }
	.tags { gap: 0.5rem; flex-wrap: wrap; }
	.live { border-color: var(--o-plum); color: var(--o-plum); }
	.steps { gap: 0; }
	.step { display: grid; grid-template-columns: 5.2rem minmax(0, 1fr) auto; gap: 0.75rem; padding: 0.65rem 0; border-top: 1px solid var(--o-hair); align-items: start; }
	.clock { padding-top: 0.2rem; }
	.body { gap: 0.1rem; min-width: 0; }
	.kind { color: var(--o-plum); }
	.gloss { font-size: 0.95rem; }
	.toggle { min-width: 44px; }
	.payload { margin: 0.5rem 0 0; padding: 0.75rem; border: 1px solid var(--o-hair); border-radius: 4px; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
	.stop-row { display: grid; grid-template-columns: 5.2rem minmax(0, 1fr); gap: 0.75rem; padding: 0.65rem 0; border-top: 1px solid var(--o-hair); }
	@media (min-width: 900px) { .timeline { padding: 3.5rem 4rem 5rem; } }
</style>
