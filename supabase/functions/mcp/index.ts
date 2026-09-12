/**
 * T4.1 MCP Streamable HTTP transport and JWT authorisation.
 *
 * Runtime env, same names as `scripts/bootstrap-env.sh` (no defaults):
 * `ORMA_API_URL`, `SUPABASE_ANON_KEY`.
 * Always `ORMA_API_URL`, never `*.supabase.co`.
 * Never use the service role. Every DB access runs under the caller's RLS.
 *
 * Function slug is `mcp`. Public path will be `orma-api.nryn.dev/mcp`.
 * Transport is Streamable HTTP in stateless mode with JSON responses.
 *
 * Authorisation is the caller's Supabase JWT (Authorization Bearer).
 * Missing or expired tokens are clean auth errors, never a 500.
 *
 * Tool names are registered here. Handlers are stubs until T4.2 owns
 * `supabase/functions/mcp/tools/`. `list_items` runs a scoped select so
 * cross-user isolation is pinable before T4.2.
 *
 * Pin with:
 * `deno test --allow-net --allow-env --allow-read supabase/functions/mcp/index.ts`
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.30.0/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.30.0/server/webStandardStreamableHttp.js";

export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const MCP_SERVER_NAME = "orma";
export const MCP_SERVER_VERSION = "0.1.0";

export const TOOL_NAMES = [
  "add_item",
  "list_items",
  "retire_item",
  "set_slot",
  "get_last_call",
  "get_patterns",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type AuthenticatedUser = {
  userId: string;
};

export type UserScopedClient = SupabaseClient;

export type McpDeps = {
  apiUrl: string;
  anonKey: string;
  fetch: typeof fetch;
  authenticate?: (token: string) => Promise<AuthenticatedUser>;
  createUserClient?: (
    token: string,
    user: AuthenticatedUser,
  ) => UserScopedClient;
};

export class AuthError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function requireNamedEnv(
  name: string,
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
): string {
  const value = getEnv(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export function depsFromEnv(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
  fetchImpl: typeof fetch = fetch,
): McpDeps {
  const apiUrl = requireNamedEnv("ORMA_API_URL", getEnv);
  if (apiUrl.includes("supabase.co")) {
    throw new Error("ORMA_API_URL must not be a project host");
  }
  return {
    apiUrl,
    anonKey: requireNamedEnv("SUPABASE_ANON_KEY", getEnv),
    fetch: fetchImpl,
  };
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  if (!match) return null;
  return match[1];
}

export function apiBase(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  if (base.includes("supabase.co")) {
    throw new Error("must not use the project host");
  }
  return base;
}

export function createUserScopedClient(
  deps: Pick<McpDeps, "apiUrl" | "anonKey" | "fetch">,
  token: string,
): UserScopedClient {
  if (!token) throw new AuthError("unauthorized: missing bearer token");
  const url = apiBase(deps.apiUrl);
  return createClient(url, deps.anonKey, {
    global: {
      fetch: deps.fetch,
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function authenticateBearer(
  deps: McpDeps,
  token: string,
): Promise<AuthenticatedUser> {
  if (deps.authenticate) return deps.authenticate(token);
  const client = createUserScopedClient(deps, token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new AuthError("unauthorized: invalid or expired token");
  }
  return { userId: data.user.id };
}

function notImplementedResult(name: string) {
  return {
    content: [{ type: "text" as const, text: `not implemented: ${name}` }],
    isError: true,
  };
}

export async function listItemsForUser(
  client: UserScopedClient,
): Promise<Array<{ id: string; text: string; user_id: string }>> {
  const { data, error } = await client
    .from("items")
    .select("id,text,user_id")
    .eq("status", "open");
  if (error) {
    throw new Error(`list_items failed: ${error.message}`);
  }
  return (data ?? []) as Array<{ id: string; text: string; user_id: string }>;
}

export function createOrmaMcpServer(client: UserScopedClient): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  for (const name of TOOL_NAMES) {
    if (name === "list_items") {
      server.registerTool(
        name,
        {
          description:
            "List the caller's open items under row-level security.",
        },
        async () => {
          const rows = await listItemsForUser(client);
          return {
            content: [{ type: "text", text: JSON.stringify(rows) }],
          };
        },
      );
      continue;
    }
    server.registerTool(
      name,
      { description: `Orma tool ${name}. Handler ships in T4.2.` },
      async () => notImplementedResult(name),
    );
  }

  return server;
}

function authErrorResponse(message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer error="invalid_token"',
      },
    },
  );
}

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
    {
      status: 405,
      headers: { "content-type": "application/json" },
    },
  );
}

export function createMcpHandler(
  deps: McpDeps,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "GET" || req.method === "DELETE") {
      return methodNotAllowed();
    }
    if (req.method !== "POST") return methodNotAllowed();

    const token = extractBearerToken(req);
    if (token === null) {
      return authErrorResponse("unauthorized: missing bearer token");
    }

    let user: AuthenticatedUser;
    try {
      user = await authenticateBearer(deps, token);
    } catch (error) {
      if (error instanceof AuthError) {
        return authErrorResponse(error.message);
      }
      throw error;
    }

    const client = deps.createUserClient
      ? deps.createUserClient(token, user)
      : createUserScopedClient(deps, token);

    const server = createOrmaMcpServer(client);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);

    try {
      return await transport.handleRequest(req);
    } finally {
      await transport.close();
      await server.close();
    }
  };
}

if (import.meta.main) {
  const deps = depsFromEnv();
  Deno.serve(createMcpHandler(deps));
}
