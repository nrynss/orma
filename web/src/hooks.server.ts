import { redirect, type Handle } from "@sveltejs/kit"
import { createSupabaseServerClient, getAuthLocals } from "$lib/supabase"

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = createSupabaseServerClient({
		getAll: () => event.cookies.getAll(),
		setAll: (cookiesToSet, headers) => {
			for (const { name, value, options } of cookiesToSet) {
				event.cookies.set(name, value, { ...options, path: "/" })
			}
			if (headers && Object.keys(headers).length > 0) {
				try {
					event.setHeaders(headers)
				} catch {
					// SvelteKit rejects assigning the same cache header twice.
				}
			}
		}
	})

	const auth = getAuthLocals(event.locals)
	auth.supabase = supabase

	const { data: sessionData } = await supabase.auth.getSession()
	let session = sessionData.session ?? null
	let user = session?.user ?? null

	if (session) {
		const { data: userData, error } = await supabase.auth.getUser()
		if (error || !userData.user) {
			session = null
			user = null
		} else {
			user = userData.user
		}
	}

	auth.session = session
	auth.user = user

	const path = event.url.pathname
	const signedIn = Boolean(session?.access_token && user?.id)

	if (path.startsWith("/app") && !signedIn) {
		redirect(303, "/login")
	}

	if (signedIn && path === "/login") {
		redirect(303, "/app/settings")
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === "content-range" || name === "x-supabase-api-version"
		}
	})
}
