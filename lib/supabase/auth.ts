import { createClient } from "./server";

/**
 * Get the authenticated user from Supabase
 * Returns null if not authenticated
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Require authentication for an API route
 * Throws an error response if not authenticated
 */
export async function requireAuth() {
  const user = await getAuthUser();

  if (!user) {
    throw new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return user;
}

/**
 * Get the user ID if authenticated, or null
 */
export async function getAuthUserId(): Promise<string | null> {
  const user = await getAuthUser();
  return user?.id || null;
}
