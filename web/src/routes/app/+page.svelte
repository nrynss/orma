<script lang="ts">
	import { invalidate } from '$app/navigation'
	import { onMount } from 'svelte'
	import { TELEGRAM_BOT_USERNAME } from '$lib/telegram-link'
	import { ItemLine, LiveDot, MoodMarker } from '$lib/ui'
	import {
		addedLabel,
		dispositionLabel,
		durationSeconds,
		formatClock,
		formatDayLabel,
		formatNextCall,
		isFirstRun,
		lastCallHeadline,
		lastCallSummary,
		liveSteps,
		mentionLabel,
		moodView,
		nextSlotInstant,
		openItemsView,
		pickLiveRun,
		pickNextRun
	} from '$lib/today/model'

	let { data } = $props()

	const LIVE_POLL_MS = 15_000
	const FALLBACK_ZONE = 'Asia/Kolkata'

	let now = $state(new Date())

	const rows = $derived(data.rows)
	const zone = $derived(rows?.profile?.timezone || FALLBACK_ZONE)
	const name = $derived(rows?.profile?.display_name ?? '')
	const nextRun = $derived(rows ? pickNextRun(rows.runs, now) : null)
	const liveRun = $derived(rows ? pickLiveRun(rows.runs) : null)
	const firstRun = $derived(rows ? isFirstRun(rows.runs) : false)
	const firstCallAt = $derived(
		nextRun?.scheduled_for ?? (rows ? nextSlotInstant(rows.slots, zone, now)?.toISOString() : undefined)
	)
	const open = $derived(rows ? openItemsView(rows.items, rows.openMentions, zone, now) : [])
	const lastCall = $derived(rows?.lastCall ?? null)
	const summary = $derived(
		rows && lastCall
			? lastCallSummary(lastCall, rows.lastMentions, rows.lastCommitments, zone, now)
			: null
	)
	const OPEN_SHOWN = 5

	onMount(() => {
		const clock = setInterval(() => (now = new Date()), 30_000)
		return () => clearInterval(clock)
	})

	$effect(() => {
		if (!liveRun) return
		const poll = setInterval(() => void invalidate('orma:today'), LIVE_POLL_MS)
		return () => clearInterval(poll)
	})

	function historyHref(runId: string, offset?: number | null): string {
		const base = `/app/history?run=${encodeURIComponent(runId)}`
		return offset === null || offset === undefined ? base : `${base}&t=${offset}`
	}
</script>

<svelte:head>
	<title>Today · Orma</title>
</svelte:head>

<main class="today">
	{#if data.error || !rows}
		<section class="o-stack head">
			<h1 class="o-h1">Today</h1>
			<p class="o-hint" role="alert">{data.error || 'Could not load Today.'}</p>
		</section>
	{:else if liveRun}
		<section class="o-stack head">
			<span class="o-label">{formatDayLabel(now, zone)}</span>
			<h1 class="o-h1">Today</h1>
		</section>

		<section class="o-wash o-stack card live" aria-live="polite">
			<div class="o-row live-head">
				<LiveDot />
				<span class="o-label plum">Calling now</span>
			</div>
			<div class="live-title">Your {formatClock(liveRun.scheduled_for, zone)} call</div>
			<ol class="steps">
				{#each liveSteps(liveRun, zone) as step, index (index)}
					<li class="o-row step" class:todo={step.status === 'todo'} class:now={step.status === 'now'}>
						<span class="step-mark">
							{#if step.status === 'done'}
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg>
							{:else if step.status === 'now'}
								<LiveDot />
							{:else}
								<span class="ring" aria-hidden="true"></span>
							{/if}
						</span>
						<span class="step-label">{step.label}</span>
						<span class="o-mono o-muted">{step.at}</span>
					</li>
				{/each}
			</ol>
			<p class="o-hint">Nothing to do here. This page updates on its own.</p>
		</section>

		<section class="o-stack list">
			<div class="o-row split">
				<h2 class="o-h2">Open · {open.length}</h2>
				<a class="small" href="/app/items">All items</a>
			</div>
			{#each open.slice(0, OPEN_SHOWN) as item (item.id)}
				<ItemLine text={item.text} meta={item.meta} />
			{/each}
		</section>
	{:else if firstRun}
		<section class="o-stack head">
			<span class="o-label">{formatDayLabel(now, zone)}</span>
			<h1 class="o-h1">Welcome{name ? `, ${name}` : ''}</h1>
		</section>

		<section class="o-wash o-stack card first">
			<span class="o-label plum">Your first call</span>
			{#if firstCallAt}
				<div class="big">{formatNextCall(firstCallAt, zone, now)}</div>
				<p>Two minutes. Orma leads with what you've told it, asks what's new, and hangs up.</p>
				<p class="o-hint">
					{zone}. It comes from a number you won't recognise, and your phone may call it spam. Answer
					it anyway.
				</p>
			{:else}
				<div class="big">Not set yet</div>
				<p class="o-hint">Choose a time in <a href="/app/settings">Settings</a> and Orma will call then.</p>
			{/if}
		</section>

		<section class="o-stack list">
			<h2 class="o-h2">What Orma knows so far · {open.length}</h2>
			{#each open as item (item.id)}
				{@const row = rows.items.find((candidate) => candidate.id === item.id)}
				<ItemLine text={item.text} meta={row ? addedLabel(row, zone, now) : ''} />
			{/each}
			<p class="o-hint after-list">
				Send anything {open.length > 0 ? 'else ' : ''}to
				<a href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}>@{TELEGRAM_BOT_USERNAME}</a>, or just say it on
				the call.
			</p>
		</section>

		<section class="o-stack list">
			<h2 class="o-h2">After the call</h2>
			<p class="o-muted">
				What was captured, retired and promised shows up here, with the transcript a tap away.
			</p>
		</section>
	{:else}
		<section class="o-stack head">
			<span class="o-label">{formatDayLabel(now, zone)}</span>
			<h1 class="o-h1">Today</h1>
		</section>

		<section class="o-wash o-stack card">
			<span class="o-label plum">Next call</span>
			{#if nextRun}
				<div class="big">{formatNextCall(nextRun.scheduled_for, zone, now)}</div>
				<p class="o-hint">{zone}. It comes from a number you won't recognise. Answer it anyway.</p>
				<div class="o-row actions">
					<a class="o-btn o-btn-secondary" href="/app/settings">Cancel this call</a>
					<a class="o-btn o-btn-text" href="/app/settings">Change time</a>
				</div>
			{:else}
				<div class="big">None scheduled</div>
				<p class="o-hint">No call is booked right now. Set a time or resume calls in Settings.</p>
				<div class="o-row actions">
					<a class="o-btn o-btn-secondary" href="/app/settings">Open Settings</a>
				</div>
			{/if}
		</section>

		{#if lastCall && summary}
			{@const mood = moodView(lastCall)}
			<section class="o-stack last">
				<div class="o-row split">
					<h2 class="o-h2">Last call</h2>
					<MoodMarker label={mood.label} none={mood.none} />
				</div>
				<p class="headline">
					{lastCallHeadline(lastCall, zone, now, durationSeconds(rows.lastTranscriptRaw))}
				</p>
				<p class="o-hint">
					{[dispositionLabel(lastCall.disposition), mentionLabel(summary.mentionCount)]
						.filter(Boolean)
						.join(' · ')}
				</p>
				{#if summary.lines.length > 0}
					<div class="o-stack lines">
						{#each summary.lines as line, index (index)}
							<div class="o-row line">
								<span class="o-label line-label">{line.label}</span>
								<span class="line-text">{line.text}</span>
								{#if line.offset}
									<a class="o-mono" href={historyHref(lastCall.id, line.offsetSeconds)}>{line.offset}</a>
								{/if}
							</div>
						{/each}
					</div>
				{:else if lastCall.disposition === 'not_answered'}
					<p class="o-muted">Nobody picked up. Every item stays open for the next call.</p>
				{:else}
					<p class="o-muted">Nothing was retired, promised or captured on this call.</p>
				{/if}
				<a class="small" href={historyHref(lastCall.id)}>Read the transcript</a>
			</section>
		{/if}

		<section class="o-stack list">
			<div class="o-row split">
				<h2 class="o-h2">Open · {open.length}</h2>
				<a class="small" href="/app/items">All items</a>
			</div>
			{#each open.slice(0, OPEN_SHOWN) as item (item.id)}
				<ItemLine text={item.text} meta={item.meta} />
			{:else}
				<p class="o-muted empty">Nothing open. Anything you mention on a call lands here.</p>
			{/each}
		</section>
	{/if}
</main>

<style>
	.today {
		max-width: 38rem;
		padding: 1.75rem 1.5rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 2.25rem;
	}
	@media (min-width: 900px) {
		.today {
			padding: 3.5rem 4rem 5rem;
			gap: 2.5rem;
		}
	}
	.head {
		gap: 0.4rem;
	}
	.plum {
		color: var(--o-plum);
	}
	.card {
		padding: 1.25rem 1.25rem 1rem;
		gap: 0.6rem;
	}
	.card.first {
		padding: 1.5rem 1.25rem;
		gap: 0.75rem;
	}
	.card.live {
		padding: 1.25rem;
		gap: 0.75rem;
	}
	.big {
		font-size: 1.9rem;
		line-height: 1.1;
		font-weight: 600;
	}
	.actions {
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.25rem;
	}
	.split {
		justify-content: space-between;
		gap: 1rem;
	}
	.last {
		gap: 0.75rem;
	}
	.headline {
		font-size: 1.05rem;
	}
	.lines {
		gap: 0.35rem;
	}
	.line {
		gap: 0.6rem;
	}
	.line-label {
		width: 5.5rem;
		flex: none;
	}
	.line-text {
		flex: 1;
	}
	.small {
		font-size: 0.95rem;
	}
	.list {
		gap: 0.25rem;
	}
	.list .split {
		margin-bottom: 0.4rem;
	}
	.after-list {
		margin-top: 0.5rem;
	}
	.empty {
		padding: 0.7rem 0;
		border-top: 1px solid var(--o-hair);
	}
	.live-head {
		gap: 0.6rem;
	}
	.live-title {
		font-size: 1.6rem;
		line-height: 1.15;
		font-weight: 600;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.step {
		gap: 0.75rem;
		min-height: 36px;
	}
	.step-mark {
		width: 16px;
		display: inline-flex;
		justify-content: center;
		color: var(--o-plum);
	}
	.step-label {
		flex: 1;
	}
	.step.now .step-label {
		font-weight: 600;
	}
	.step.todo .step-label {
		color: var(--o-muted);
	}
	.ring {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1.5px solid var(--o-line);
	}
</style>
