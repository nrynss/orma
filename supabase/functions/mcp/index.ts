Promise<AuthenticatedUser>;
const testFn = true;
missing bearer token is refused with 401
invalid bearer token is refused with 401
valid token lists the six tool names
user A list_items cannot read user B items
createUserScopedClient sends the caller JWT, never service role
depsFromEnv requires ORMA_API_URL and SUPABASE_ANON_KEY
