<script lang="ts">
	import { invalidate } from '$app/navigation'
	import { getSupabase } from '$lib/supabase'
	import { ageLabel, itemAgeDays, mentionLabel } from '$lib/today/model'
	import type { ItemRows } from './+page'

	let { data } = $props()

	const FALLBACK_ZONE = 'Asia/Kolkata'
	let now = $state(new Date())
	let newText = $state('')
	let openDetail = $state<string | null>(null)
	let editingSince = $state('')
	let busy = $state<string | null>(null)
	let message = $state('')

	const rows = $derived(data.rows)
	const zone = $derived(rows?.profile?.timezone || FALLBACK_ZONE)
	const counts = $derived.by(() => {
		const result = new Map<string, number>()
		for (const mention of rows?.mentions ?? []) result.set(mention.item_id, (result.get(mention.item_id) ?? 0) + 1)
		return result
	})
	const openItems = $derived((rows?.items ?? []).filter((item) => item.status === 'open'))
	const retiredItems = $derived(
		(rows?.items ?? [])
			.filter((item) => item.status === 'retired')
			.toSorted((a, b) => (b.retired_at ?? '').localeCompare(a.retired_at ?? ''))
	)

	function itemMeta(item: ItemRows['items'][number]): string {
		const count = counts.get(item.id) ?? 0
		return `${mentionLabel(count)} · ${ageLabel(itemAgeDays(item, zone, now))}`
	}

	function sourceLabel(source: string): string | null {
		return ({ call: 'from the call', telegram: 'from Telegram', mcp: 'from an agent' })[source] ?? null
	}

	function openEditor(item: ItemRows['items'][number]) {
		openDetail = item.id
		editingSince = item.since_date ?? ''
		message = ''
	}

	async function addItem() {
		if (!rows) return
		const text = newText.trim()
		if (!text) return
		busy = 'add'
		message = ''
		const { error } = await getSupabase().from('items').insert({ user_id: rows.userId, text, source: 'web' })
		busy = null
		if (error) {
			message = `Could not add this item: ${error.message}`
			return
		}
		newText = ''
		message = 'Added.'
		await invalidate('orma:items')
	}

	async function saveSince(id: string) {
		if (editingSince && !/^\d{4}-\d{2}-\d{2}$/.test(editingSince)) {
			message = 'Enter the date as YYYY-MM-DD.'
			return
		}
		busy = id
		message = ''
		const { error } = await getSupabase().from('items').update({ since_date: editingSince || null }).eq('id', id)
		busy = null
		if (error) {
			message = `Could not save the date: ${error.message}`
			return
		}
		message = 'Since date saved.'
		await invalidate('orma:items')
	}

	async function retire(id: string) {
		busy = id
		message = ''
		const { error } = await getSupabase()
			.from('items')
			.update({ status: 'retired', retired_at: new Date().toISOString(), retired_reason: 'retired here' })
			.eq('id', id)
		busy = null
		if (error) {
			message = `Could not retire this item: ${error.message}`
			return
		}
		openDetail = null
		message = 'Retired. You can restore it whenever you want.'
		await invalidate('orma:items')
	}

	async function restore(id: string) {
		busy = id
		message = ''
		const { error } = await getSupabase()
			.from('items')
			.update({ status: 'open', retired_at: null, retired_reason: null })
			.eq('id', id)
		busy = null
		if (error) {
			message = `Could not restore this item: ${error.message}`
			return
		}
		message = 'Restored to your open items.'
		await invalidate('orma:items')
	}
</script>

<svelte:head><title>Items · Orma</title></svelte:head>

<main class="items">
	{#if data.error || !rows}
		<section class="o-stack head"><h1 class="o-h1">Items</h1><p class="o-hint" role="alert">{data.error || 'Could not load your items.'}</p></section>
	{:else}
		<section class="o-stack head">
			<h1 class="o-h1">Items</h1>
			<form class="add" onsubmit={(event) => { event.preventDefault(); void addItem() }}>
				<label class="sr-only" for="new-item">Add something to keep track of</label>
				<input id="new-item" class="o-input" bind:value={newText} placeholder="Add something to keep track of" maxlength="500" />
				<button class="o-btn o-btn-primary" disabled={busy === 'add' || !newText.trim()}>{busy === 'add' ? 'Adding…' : 'Add'}</button>
			</form>
			{#if message}<p class="o-hint" role="status">{message}</p>{/if}
		</section>

		<section class="o-stack list">
			<div class="section-head"><h2 class="o-h2">Open · {openItems.length}</h2><span class="o-hint">Counts come from the calls</span></div>
			{#each openItems as item (item.id)}
				<div class="item">
					<div class="item-top">
						<div class="o-stack copy"><span>{item.text}</span><span class="o-muted meta">{itemMeta(item)} {#if sourceLabel(item.source)}<span class="o-tag">{sourceLabel(item.source)}</span>{/if}</span></div>
						<button class="o-btn o-btn-text" onclick={() => openDetail === item.id ? (openDetail = null) : openEditor(item)} aria-expanded={openDetail === item.id}>{openDetail === item.id ? 'Close' : 'Details'}</button>
					</div>
					{#if openDetail === item.id}
						<div class="detail o-wash o-stack">
							<label class="field" for={`since-${item.id}`}><span class="field-label">Since</span><span class="o-row date-row"><input id={`since-${item.id}`} class="o-input" type="date" bind:value={editingSince} /><button class="o-btn o-btn-secondary" type="button" onclick={() => void saveSince(item.id)} disabled={busy === item.id}>Save</button></span><span class="o-hint">Orma counts the age from this date. Leave it empty to count from when you added it.</span></label>
							<div class="o-row detail-actions"><button class="o-btn o-btn-secondary" type="button" onclick={() => void retire(item.id)} disabled={busy === item.id}>Retire</button><span class="o-hint">{counts.get(item.id) ?? 0} recorded mentions</span></div>
						</div>
					{:else}
						<button class="o-btn o-btn-text retire" type="button" onclick={() => void retire(item.id)} disabled={busy === item.id}>Retire</button>
					{/if}
				</div>
			{:else}
				<p class="o-hint empty">Nothing is open yet. Add something you want Orma to remember.</p>
			{/each}
		</section>

		<section class="o-stack list">
			<h2 class="o-h2">Retired · {retiredItems.length}</h2>
			{#each retiredItems as item (item.id)}
				<div class="item retired"><div class="item-top"><div class="o-stack copy"><span>{item.text} {#if item.seeded}<span class="o-tag">seeded</span>{/if}</span><span class="o-muted meta">{item.retired_reason || 'Retired'} · {itemMeta(item)}</span></div><button class="o-btn o-btn-text" type="button" onclick={() => void restore(item.id)} disabled={busy === item.id}>Restore</button></div></div>
			{:else}
				<p class="o-hint empty">Nothing retired.</p>
			{/each}
			<p class="o-hint after-list">Retiring is never a failure. Restore brings an item back with its history.</p>
		</section>
	{/if}
</main>

<style>
	.items { max-width: 38rem; padding: 1.75rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 2.5rem; }
	.head, .list { gap: 1rem; }
	.add, .date-row { display: flex; gap: 0.5rem; }
	.o-input { width: 100%; min-height: 44px; padding: 0 0.75rem; border: 1px solid var(--o-line); border-radius: 4px; background: var(--o-paper); color: var(--o-ink); font: inherit; }
	.o-input:focus { outline: 2px solid var(--o-plum); outline-offset: 2px; }
	.section-head, .item-top, .detail-actions { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
	.section-head .o-hint { font-size: 0.85rem; }
	.item { border-top: 1px solid var(--o-hair); padding: 0.7rem 0; }
	.copy { flex: 1; gap: 0.15rem; min-width: 0; }
	.meta { font-size: 0.88rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; }
	.retire { margin-left: auto; }
	.detail { margin-top: 0.75rem; padding: 0.9rem; gap: 0.75rem; }
	.field { display: flex; flex-direction: column; gap: 0.35rem; }
	.field-label { font-size: 0.9rem; font-weight: 600; }
	.after-list { margin-top: 0.25rem; }
	.empty { border-top: 1px solid var(--o-hair); padding-top: 0.8rem; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	@media (min-width: 900px) { .items { padding: 3.5rem 4rem 5rem; } }
	@media (max-width: 420px) { .add { align-items: stretch; } .add .o-btn { padding: 0 0.8rem; } }
</style>
