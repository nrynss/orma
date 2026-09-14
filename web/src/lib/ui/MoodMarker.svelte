<script lang="ts">
	/** A small marker for what the call heard. It is never editable. */
	let { label, none = false }: { label: string; none?: boolean } = $props()
</script>

<span class="mood"><i class:none aria-hidden="true"></i>{label}</span>

<style>
	.mood {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--o-muted);
	}
	i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--o-plum);
		display: inline-block;
	}
	i.none {
		background: transparent;
		border: 1.5px solid var(--o-line);
	}
</style>
