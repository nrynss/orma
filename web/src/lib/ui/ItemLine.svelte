<script lang="ts">
	/** One item row: the text, then a muted line of counts or provenance. */
	let { text, meta }: { text: string; meta: string } = $props()
</script>

<div class="item-line">
	<span>{text}</span>
	<span class="meta">{meta}</span>
</div>

<style>
	.item-line {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.7rem 0;
		border-top: 1px solid var(--o-hair);
	}
	.meta {
		color: var(--o-muted);
		font-size: 0.88rem;
	}
</style>
