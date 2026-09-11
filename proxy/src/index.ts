/**
 * Orma's front door to Supabase.
 *
 * Every Supabase service for a project lives on one host under a different
 * path: /rest/v1 for PostgREST, /auth/v1 for Auth, /functions/v1 for Edge
 * Functions, /storage/v1 for Storage, /realtime/v1 for websockets. This worker
 * passes all of them through under orma-api.nryn.dev.
 *
 * Two reasons it exists.
 *
 * The webhook and MCP URLs are Orma's own, so a judge who pastes one into a
 * client keeps a working URL even if the Supabase project is ever replaced.
 *
 * It also routes around a local network that resolves *.supabase.co to the
 * wrong address. Requests here resolve to Cloudflare and are fetched from
 * Supabase on Cloudflare's network, so the block never applies.
 *
 * It adds no authentication of its own. Callers still present their own
 * Supabase key or JWT, exactly as they would against the project host.
 */

interface Env {
	SUPABASE_HOST: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		url.hostname = env.SUPABASE_HOST;
		url.protocol = 'https:';
		url.port = '';

		// Supabase routes on the Host header, so it has to be rewritten rather
		// than passed through, or every request 404s at the edge.
		const headers = new Headers(request.headers);
		headers.set('Host', env.SUPABASE_HOST);

		const upstream = new Request(url.toString(), {
			method: request.method,
			headers,
			body: request.body,
			redirect: 'manual'
		});

		return fetch(upstream);
	}
} satisfies ExportedHandler<Env>;
