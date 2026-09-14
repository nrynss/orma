<script lang="ts">
	import { formatClock, formatDayLabel } from '$lib/today/model'
	import {
		axisLabel,
		completedSoFar,
		factEntries,
		isAnswered,
		moodLane,
		periodLabel,
		proseParagraphs,
		requiredDays,
		trendRuns
	} from './model'
	import type { PatternRows } from './+page'

	let { data } = $props()

	const FALLBACK_ZONE = 'Asia/Kolkata'
	const LANE_Y = [27, 57, 87, 117]
	const HOLLOW_Y = 140
	const PLOT_LEFT = 76
	const PLOT_RIGHT = 334

	const rows = $derived(data.rows as PatternRows | null)
	const zone = $derived(rows?.timezone || FALLBACK_ZONE)
	const facts = $derived((rows?.report?.facts ?? {}) as Record<string, unknown>)
	const sufficient = $derived(facts['sufficient_history'] === true)
	const notYet = $derived(!rows?.report || !sufficient)
	const paragraphs = $derived(rows?.report ? proseParagraphs(rows.report.prose) : [])
	const entries = $derived(factEntries(facts))
	const period = $derived(
		rows?.report
			? trendRuns(rows.runs, rows.report.period_start, rows.report.period_end)
			: []
	)
	const sent = $derived.by(() => {
		if (!rows?.report) return null
		const ids = new Set(period.map((run) => run.id))
		return (
			rows.deliveries.find(
				(delivery) => delivery.sent_at && (delivery.call_run_id === null || ids.has(delivery.call_run_id))
			) ?? null
		)
	})

	function pointX(index: number, total: number): number {
		return PLOT_LEFT + ((index + 0.5) * (PLOT_RIGHT - PLOT_LEFT)) / total
	}

	function sentLine(channel: string, sentAt: string): string {
		const when = `${formatDayLabel(sentAt, zone)} at ${formatClock(sentAt, zone)}`
		if (channel === 'telegram') return `Sent to Telegram on ${when}.`
		if (channel === 'email') return `Sent by email on ${when}.`
		return `Sent over ${channel} on ${when}.`
	}

	function pluralCalls(count: number): string {
		return count === 1 ? '1 call' : `${count} calls`
	}
</script>

<svelte:head><title>Patterns · Orma</title></svelte:head>

<main class="patterns">
	{#if data.error || !rows}
		<section class="o-stack head">
			<h1 class="o-h1">Patterns</h1>
			<p class="o-hint" role="alert">{data.error || 'Could not load your patterns.'}</p>
		</section>
	{:else if notYet}
		<section class="o-stack head">
			<span class="o-label">Your first week</span>
			<h1 class="o-h1">Patterns</h1>
		</section>
		<section class="o-wash o-stack notyet">
			<div class="notyet-title">Not enough calls yet</div>
			<p>
				A pattern needs a run of days. You have had {pluralCalls(completedSoFar(rows.runs))} so far.
				The first report comes after {requiredDays(rows.report?.facts as Record<string, unknown> | null)} observed days.
			</p>
			<p class="o-hint">Orma will not guess at a trend from a few mornings.</p>
		</section>
	{:else if rows.report}
		<section class="o-stack head">
			<span class="o-label">{periodLabel(facts, rows.report)}</span>
			<h1 class="o-h1">Patterns</h1>
		</section>

		<section class="o-stack prose">
			{#each paragraphs as paragraph}
				<p class="lede">{paragraph}</p>
			{/each}
			{#if sent?.sent_at}
				<p class="o-hint">{sentLine(sent.channel, sent.sent_at)}</p>
			{/if}
		</section>

		<section class="o-stack chart">
			<h2 class="o-h2">Mood across the period</h2>
			{#if period.length === 0}
				<p class="o-hint">No calls fall inside this report period.</p>
			{:else}
				<svg width="342" height="166" viewBox="0 0 342 166" style="display: block; overflow: visible;" role="img" aria-label="Mood trend across the report period">
					<text x="0" y="31" font-size="12" fill="var(--o-muted)" font-family="Source Serif 4, Georgia, serif">energised</text>
					<line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={LANE_Y[0]} y2={LANE_Y[0]} stroke="var(--o-hair)" stroke-width="1" />
					<text x="0" y="61" font-size="12" fill="var(--o-muted)" font-family="Source Serif 4, Georgia, serif">ok</text>
					<line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={LANE_Y[1]} y2={LANE_Y[1]} stroke="var(--o-hair)" stroke-width="1" />
					<text x="0" y="91" font-size="12" fill="var(--o-muted)" font-family="Source Serif 4, Georgia, serif">low</text>
					<line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={LANE_Y[2]} y2={LANE_Y[2]} stroke="var(--o-hair)" stroke-width="1" />
					<text x="0" y="121" font-size="12" fill="var(--o-muted)" font-family="Source Serif 4, Georgia, serif">stressed</text>
					<line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={LANE_Y[3]} y2={LANE_Y[3]} stroke="var(--o-hair)" stroke-width="1" />
					{#each period as run, index (run.id)}
						{@const lane = moodLane(run.mood)}
						{@const heard = lane >= 0 && isAnswered(run.disposition)}
						<circle
							cx={pointX(index, period.length)}
							cy={heard ? LANE_Y[lane] : HOLLOW_Y}
							r={heard ? 5 : 3.5}
							fill={heard ? 'var(--o-plum)' : 'none'}
							stroke={heard ? 'none' : 'var(--o-line)'}
							stroke-width={heard ? 0 : 1.5}
						>
							<title>{axisLabel(run.local_date)}: {run.mood ?? 'no mood heard'}</title>
						</circle>
					{/each}
					<text x={pointX(0, period.length)} y="164" font-size="11" text-anchor="middle" fill="var(--o-muted)" font-family="Source Code Pro, monospace">{axisLabel(period[0].local_date)}</text>
					{#if period.length > 2}
						<text x={pointX(Math.floor(period.length / 2), period.length)} y="164" font-size="11" text-anchor="middle" fill="var(--o-muted)" font-family="Source Code Pro, monospace">{axisLabel(period[Math.floor(period.length / 2)].local_date)}</text>
					{/if}
					{#if period.length > 1}
						<text x={pointX(period.length - 1, period.length)} y="164" font-size="11" text-anchor="middle" fill="var(--o-muted)" font-family="Source Code Pro, monospace">{axisLabel(period[period.length - 1].local_date)}</text>
					{/if}
				</svg>
				<div class="o-row legend">
					<span class="mood"><i></i>what the call heard</span>
					<span class="mood"><i class="none"></i>no call answered</span>
				</div>
			{/if}
		</section>

		<section class="o-stack facts">
			<div class="o-row facts-head"><h2 class="o-h2">Facts</h2><span class="o-hint">Computed by SQL</span></div>
			{#each entries as entry (entry.key)}
				<div class="o-row fact">
					<span class="o-mono o-muted key">{entry.key}</span>
					<span class="o-mono value">{entry.value}</span>
				</div>
			{/each}
			<p class="o-hint">Every number in the report is one of these. If it is not, the report is written again.</p>
		</section>
	{:else}
		<section class="o-stack head">
			<h1 class="o-h1">Patterns</h1>
			<p class="o-hint" role="alert">Could not load your patterns.</p>
		</section>
	{/if}
</main>

<style>
	.patterns { max-width: 38rem; padding: 1.75rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 2.25rem; }
	.head { gap: 0.4rem; }
	.notyet { padding: 1.5rem 1.25rem; gap: 0.75rem; }
	.notyet-title { font-size: 1.4rem; line-height: 1.2; font-weight: 600; }
	.prose { gap: 1rem; }
	.lede { font-size: 1.1rem; line-height: 1.65; }
	.chart { gap: 0.75rem; }
	.legend { gap: 1rem; flex-wrap: wrap; }
	.mood { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: var(--o-muted); }
	.mood i { width: 8px; height: 8px; border-radius: 50%; background: var(--o-plum); display: inline-block; }
	.mood i.none { background: transparent; border: 1.5px solid var(--o-line); }
	.facts-head { justify-content: space-between; }
	.facts-head .o-hint { font-size: 0.85rem; }
	.fact { justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-top: 1px solid var(--o-hair); align-items: baseline; }
	.fact .key { flex: none; }
	.fact .value { text-align: right; overflow-wrap: anywhere; }
	@media (min-width: 900px) { .patterns { padding: 3.5rem 4rem 5rem; } }
</style>
