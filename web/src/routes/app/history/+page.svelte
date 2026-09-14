<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { LiveDot, MoodMarker } from '$lib/ui'
	import {
		LIVE_STATES,
		dispositionLabel,
		durationLabel,
		durationSeconds,
		formatClock,
		formatDayLabel,
		lastCallSummary,
		moodView,
		type LastCallSummary
	} from '$lib/today/model'
	import { historyHref, parseTParam, parseTurns, type TurnView } from './model'

	let { data } = $props()

	const FALLBACK_ZONE = 'Asia/Kolkata'

	let now = $state(new Date())

	const rows = $derived(data.rows)
	const zone = $derived(rows?.profile?.timezone || FALLBACK_ZONE)
	const transcriptsByRun = $derived(new Map((rows?.transcripts ?? []).map((row) => [row.call_run_id, row])))
	const resultsByRun = $derived(new Map((rows?.results ?? []).map((row) => [row.call_run_id, row])))
	const requestedRun = $derived(page.url.searchParams.get('run'))
	const requestedT = $derived(parseTParam(page.url.searchParams.get('t')))
	const expandedId = $derived.by(() => {
		const runs = rows?.runs ?? []
		if (requestedRun && runs.some((run) => run.id === requestedRun)) return requestedRun
		return runs[0]?.id ?? null
	})

	type RunView = {
		id: string
		day: string
		meta: string
		moodLabel: string
		moodNone: boolean
		live: boolean
		noConnection: boolean
		hasResult: boolean
		summary: LastCallSummary
		short: string
		turns: TurnView[]
	}

	const views = $derived.by((): RunView[] => {
		if (!rows) return []
		return rows.runs.map((run) => {
			const transcript = transcriptsByRun.get(run.id)
			const result = resultsByRun.get(run.id)
			const summary = lastCallSummary(run, rows.mentions, rows.commitments, result?.structured ?? null, zone, now)
			const duration = durationLabel(durationSeconds(transcript?.raw))
			const mood = moodView(run)
			const live = (LIVE_STATES as readonly string[]).includes(run.state)
			const noConnection = run.disposition === 'not_answered' || run.state === 'failed'
			const at = formatClock(run.dispatched_at ?? run.scheduled_for, zone)
			const disposition = dispositionLabel(run.disposition)
			const meta = live
				? 'On the call'
				: [at, duration, disposition].filter(Boolean).join(' · ')
			const parts: string[] = []
			if (summary.retired > 0) parts.push(summary.retired === 1 ? 'Retired 1' : `Retired ${summary.retired}`)
			if (summary.committed > 0) parts.push(summary.committed === 1 ? 'Committed 1' : `Committed ${summary.committed}`)
			if (summary.captured > 0) parts.push(summary.captured === 1 ? 'Captured 1' : `Captured ${summary.captured}`)
			const short = live
				? 'On the call.'
				: noConnection
					? 'The call did not connect.'
					: parts.length > 0
						? parts.join(' · ')
						: 'Nothing new'
			return {
				id: run.id,
				day: formatDayLabel(run.dispatched_at ?? run.scheduled_for, zone),
				meta,
				moodLabel: mood.label,
				moodNone: mood.none,
				live,
				noConnection,
				hasResult: result?.valid ?? false,
				summary,
				short,
				turns: parseTurns(transcript?.turns)
			}
		})
	})

	const hero = $derived(views[0] ?? null)
	const earlier = $derived(views.slice(1))

	function isMarked(view: RunView, turn: TurnView): boolean {
		return view.id === expandedId && requestedT !== null && turn.offsetSeconds === requestedT
	}

	$effect(() => {
		if (requestedT === null || !expandedId) return
		document.querySelector('[data-turn-mark="true"]')?.scrollIntoView({ block: 'center' })
	})

	onMount(() => {
		const clock = setInterval(() => (now = new Date()), 30_000)
		return () => clearInterval(clock)
	})
</script>

<svelte:head><title>History · Orma</title></svelte:head>
{#snippet detail(view: RunView)}
	<section class="o-stack call" aria-label={`Call on ${view.day}`}>
		<div class="o-stack titles">
			<div class="o-row top">
				<span class="title">{view.day}</span>
				<MoodMarker label={view.moodLabel} none={view.moodNone} />
			</div>
			<span class="o-muted meta">{view.meta}</span>
		</div>
		{#if view.live}
			<div class="o-row live-head"><LiveDot /><span class="o-label plum">On the call</span></div>
			<p class="o-hint">Nothing to do here. The transcript lands once the call ends.</p>
		{:else}
			<div class="o-row tags">
				<span class="o-tag">retired {view.summary.retired}</span><span class="o-tag">committed {view.summary.committed}</span><span class="o-tag">captured {view.summary.captured}</span><span class="o-tag">mentions {view.summary.mentionCount}</span>
			</div>
			{#if view.noConnection}
				<p class="o-muted">The call did not connect.</p>
			{/if}
			{#if view.summary.lines.length > 0}
				<div class="o-stack lines">
					{#each view.summary.lines as line, index (index)}
						<div class="o-row line">
							<span class="o-label line-label">{line.label}</span>
							<span class="line-text">{line.text}</span>
							{#if line.offset}
								<a class="o-mono" href={historyHref(view.id, line.offsetSeconds)}>{line.offset}</a>
							{/if}
						</div>
					{/each}
				</div>
			{:else if !view.noConnection && view.hasResult}
				<p class="o-muted">Nothing was retired, promised or captured on this call.</p>
			{/if}
			{#if !view.hasResult}
				<p class="o-muted">Orma did not write anything down from this call.</p>
			{/if}
			{#if view.turns.length > 0}
				<div class="o-stack transcript">
					{#each view.turns as turn, index (index)}
						{@const marked = isMarked(view, turn)}
						<div class="turn" class:mark={marked} data-turn-mark={marked ? 'true' : null}>
							{#if turn.offset}
								<a class="o-mono" href={historyHref(view.id, turn.offsetSeconds)}>{turn.offset}</a>
							{:else}
								<span class="o-mono o-muted">—</span>
							{/if}
							<span class="who">{turn.who}</span><span>{turn.text}</span>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
{/snippet}

<main class="history">
	{#if data.error || !rows}
		<section class="o-stack head"><h1 class="o-h1">History</h1><p class="o-hint" role="alert">{data.error || 'Could not load your history.'}</p></section>
	{:else if views.length === 0}
		<section class="o-stack head">
			<h1 class="o-h1">History</h1>
			<p class="o-gloss">Every call, newest first. Mood is what the call heard.</p>
		</section>
		<section class="o-stack"><p class="o-muted">No calls yet. Your finished calls will land here, newest first.</p></section>
	{:else}
		<section class="o-stack head">
			<h1 class="o-h1">History</h1>
			<p class="o-gloss">Every call, newest first. Mood is what the call heard.</p>
		</section>

		{#if hero}
			{@const open = hero.id === expandedId}
			{#if open}
				{@render detail(hero)}
			{:else}
				<section class="o-stack call">
					<a class="rowlink" href={historyHref(hero.id)}>
						<span class="o-stack copy">
							<span>{hero.day}</span>
							<span class="o-row meta">{hero.meta} <MoodMarker label={hero.moodLabel} none={hero.moodNone} /></span>
							<span class="line-text">{hero.short}</span>
						</span>
						<span class="o-muted" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"></path></svg></span>
					</a>
				</section>
			{/if}
		{/if}

		{#if earlier.length > 0}
			<section class="o-stack">
				<h2 class="o-h2">Earlier</h2>
				{#each earlier as view (view.id)}
					{#if view.id === expandedId}
						{@render detail(view)}
					{:else}
						<a class="rowlink" href={historyHref(view.id)}>
							<span class="o-stack copy">
								<span>{view.day}</span>
								<span class="o-row meta">{view.meta} <MoodMarker label={view.moodLabel} none={view.moodNone} /></span>
								<span class="line-text">{view.short}</span>
							</span>
							<span class="o-muted" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"></path></svg></span>
						</a>
					{/if}
				{/each}
			</section>
		{/if}
	{/if}
</main>

<style>
	.history { max-width: 38rem; padding: 1.75rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 2.25rem; }
	.head { gap: 0.4rem; }
	.call { gap: 0.9rem; }
	.titles { gap: 0.15rem; }
	.top { justify-content: space-between; gap: 0.75rem; }
	.title { font-size: 1.15rem; font-weight: 600; }
	.meta { font-size: 0.9rem; gap: 0.6rem; flex-wrap: wrap; }
	.tags { gap: 0.4rem; flex-wrap: wrap; }
	.live-head { gap: 0.5rem; }
	.plum { color: var(--o-plum); }
	.lines { gap: 0.35rem; }
	.line { gap: 0.6rem; align-items: baseline; }
	.line-label { flex: none; width: 5.5rem; }
	.line-text { font-size: 0.95rem; }
	.transcript { gap: 0.1rem; border-left: 2px solid var(--o-rule); padding-left: 0.4rem; }
	.turn { display: grid; grid-template-columns: 3rem 3.6rem minmax(0, 1fr); gap: 0.25rem 0.5rem; padding: 0.3rem 0.5rem; border-radius: 4px; align-items: baseline; }
	.turn .who { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--o-muted); }
	.turn.mark { background: var(--o-wash); }
	.rowlink { display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 0; border-top: 1px solid var(--o-hair); color: inherit; text-decoration: none; }
	.copy { flex: 1; gap: 0.15rem; min-width: 0; }
	@media (min-width: 900px) { .history { padding: 3.5rem 4rem 5rem; } }
</style>
