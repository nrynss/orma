import { redirect } from "@sveltejs/kit"
import { getAuthLocals } from "$lib/supabase"
import type { EmailOtpType } from "@supabase/supabase-js"

const otpTypes = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
])

export const load = async ({ url, locals }) => {
  const auth = getAuthLocals(locals)
  const queryError = url.searchParams.get("error_description") || url.searchParams.get("error")
  if (queryError) {
    return { error: queryError }
  }

  const code = url.searchParams.get("code")
  if (code) {
    const { error } = await auth.supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect(303, "/app/settings")
    return { error: error.message }
  }

  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")
  if (tokenHash && type && otpTypes.has(type as EmailOtpType)) {
    const { error } = await auth.supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    })
    if (!error) redirect(303, "/app/settings")
    return { error: error.message }
  }

  return { error: null as string | null }
}
