import { getAuthLocals } from "$lib/supabase"
import type { LayoutServerLoad } from "./$types"

export const prerender = false

export const load: LayoutServerLoad = async ({ locals }) => {
	const auth = getAuthLocals(locals)
	return {
		session: auth.session ?? null,
		user: auth.user ?? null
	}
}
