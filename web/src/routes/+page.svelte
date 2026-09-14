<script lang="ts">
	import { onDestroy, onMount } from 'svelte'

	const lines = [
		{ who: 'Orma', text: "You've mentioned the dentist three times. It's been 34 days." },
		{ who: 'You', text: 'Kill it.' },
		{ who: 'Orma', text: "Done. It's gone." }
	]

	let supported = $state(false)
	let playing = $state(false)
	let active = $state(-1)

	function reset() {
		playing = false
		active = -1
	}

	function speakLine(index: number) {
		const utterance = new SpeechSynthesisUtterance(lines[index].text)
		if (lines[index].who === 'You') {
			utterance.pitch = 1.5
		}
		utterance.onend = () => {
			if (playing && index + 1 < lines.length) {
				active = index + 1
				speakLine(index + 1)
			} else {
				reset()
			}
		}
		utterance.onerror = () => {
			reset()
		}
		window.speechSynthesis.speak(utterance)
	}

	function play() {
		if (!supported || playing) {
			return
		}
		window.speechSynthesis.cancel()
		playing = true
		active = 0
		speakLine(0)
	}

	function stop() {
		if (!supported) {
			return
		}
		window.speechSynthesis.cancel()
		reset()
	}

	onMount(() => {
		supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
	})

	onDestroy(() => {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel()
		}
	})
</script>

<svelte:head>
	<title>Orma — it remembers what you keep not doing</title>
	<meta name="description" content="A daily two-minute accountability call. It rings at a time you chose, leads with what you keep not doing, asks what needs capturing, and hangs up." />
	<meta property="og:title" content="Orma" />
	<meta property="og:description" content="It remembers what you keep not doing." />
	<meta property="og:type" content="website" />
</svelte:head>

<main>
	<header>
		<h1>Orma</h1>
		<p class="gloss">ഓർമ്മ — it remembers what you keep not doing.</p>
	</header>

	<p class="lede">
		A daily two-minute accountability call. It rings at a time you chose, leads with what you
		keep <em>not</em> doing, asks what needs capturing, and hangs up.
	</p>

	<section class="beat">
		<p><span class="who">Orma</span>You've mentioned the dentist three times. It's been 34 days.</p>
		<p><span class="who">You</span>Kill it.</p>
		<p><span class="who">Orma</span>Done. It's gone.</p>
	</section>

	<section>
		<h2>Why a phone call</h2>
		<p>
			An app can be dismissed with no consequence and no witness. That is not a flaw in the
			design, it is the absence of the mechanism. A question asked out loud, by something that
			remembers what you said last time, has weight.
		</p>
		<p>
			The competitive set is gym buddies, standups, sponsors and coaches. People pay monthly for
			those, because the value was never tracking. It was someone asking.
		</p>
	</section>

	<section>
		<h2>Quitting is easy and unpunished</h2>
		<p>
			You can say <em>kill it, I am never doing this</em>, and Orma agrees. A list you cannot
			retire from becomes a wall of shame, and a wall of shame is a call you stop answering.
			Being allowed to drop something honestly is what keeps the rest of the list truthful.
		</p>
	</section>

	<section class="demo" aria-label="Synthetic demo">
		<h2>Synthetic demo</h2>
		<p class="demo-note">No real person, no real call. Not production evidence.</p>
		<ol>
			{#each lines as line, i}
				<li class:active={active === i}><span class="who">{line.who}</span>{line.text}</li>
			{/each}
		</ol>
		{#if supported}
			<p class="controls">
				<button onclick={play} disabled={playing}>Play synthetic audio</button>
				<button onclick={stop} disabled={!playing}>Stop</button>
			</p>
		{:else}
			<p class="controls">
				<button disabled>Play synthetic audio</button>
			</p>
			<p class="demo-note">
				Synthetic audio needs speech synthesis. This browser does not offer it.
			</p>
		{/if}
	</section>

	<section>
		<h2>Get started</h2>
		<p>
			Sign up or sign in through the <a href="/login">login page</a>.
		</p>
	</section>

	<footer>
		<p>Built for CALL-E. Sign up through the <a href="/login">login page</a>.</p>
	</footer>
</main>

<style>
	:global(html) {
		color-scheme: light dark;
	}
	:global(body) {
		margin: 0;
		background: light-dark(#fbfaf8, #14130f);
		color: light-dark(#22201c, #e8e4dc);
		font: 16px/1.6 ui-serif, Georgia, 'Times New Roman', serif;
	}
	main {
		max-width: 34rem;
		margin: 0 auto;
		padding: 4rem 1.5rem 6rem;
	}
	header {
		margin-bottom: 3rem;
	}
	h1 {
		font-size: 2.5rem;
		margin: 0;
		letter-spacing: -0.02em;
	}
	.gloss {
		margin: 0.25rem 0 0;
		color: light-dark(#7a746a, #938c80);
		font-size: 0.95rem;
	}
	.lede {
		font-size: 1.2rem;
	}
	h2 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: light-dark(#7a746a, #938c80);
		margin-top: 3rem;
		font-weight: 600;
	}
	.beat {
		border-left: 2px solid light-dark(#d8d2c6, #3a352c);
		padding-left: 1.25rem;
		margin: 3rem 0;
	}
	.beat p {
		margin: 0.4rem 0;
	}
	.who {
		display: inline-block;
		width: 4.2rem;
		color: light-dark(#7a746a, #938c80);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.demo {
		margin-top: 3rem;
		padding: 1.25rem 1.25rem 1rem;
		border: 1px solid light-dark(#e6e1d7, #2a2620);
		border-radius: 0.75rem;
		background: light-dark(#fffdf9, #1a1813);
	}
	.demo h2 {
		margin-top: 0;
	}
	.demo-note {
		color: light-dark(#7a746a, #938c80);
		font-size: 0.9rem;
	}
	.demo ol {
		list-style: none;
		margin: 1rem 0;
		padding: 0;
	}
	.demo li {
		margin: 0.4rem 0;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
	}
	.demo li.active {
		background: light-dark(#f0ebe0, #2a2620);
	}
	.controls {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0;
	}
	.controls button {
		font: inherit;
		font-size: 0.9rem;
		padding: 0.4rem 0.9rem;
		border-radius: 0.5rem;
		border: 1px solid light-dark(#d8d2c6, #3a352c);
		background: light-dark(#22201c, #e8e4dc);
		color: light-dark(#fbfaf8, #14130f);
		cursor: pointer;
	}
	.controls button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	footer {
		margin-top: 4rem;
		padding-top: 1.5rem;
		border-top: 1px solid light-dark(#e6e1d7, #2a2620);
		color: light-dark(#7a746a, #938c80);
		font-size: 0.9rem;
	}
</style>
