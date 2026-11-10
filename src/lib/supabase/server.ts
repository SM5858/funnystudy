import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/authCookies";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

type CreateClientOptions = {
  /**
   * Cookie mutation is only allowed inside Server Actions or Route Handlers in
   * Next.js 16. For read-only contexts (e.g. Server Components) leave this
   * false to avoid runtime warnings.
   */
  allowCookieWrite?: boolean;
  /**
   * Disable auto refresh in read-only contexts to avoid refresh attempts that
   * would try to mutate cookies.
   */
  autoRefreshToken?: boolean;
};

/**
 * Next.js 16 makes `cookies()` async in server actions; we await it to support
 * both the async and sync implementations depending on runtime.
 */
export async function createClient(options: CreateClientOptions = {}) {
  const {
    allowCookieWrite = false,
    autoRefreshToken = allowCookieWrite,
  } = options;
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublicKey } = getSupabasePublicEnv();

  return createServerClient(
    supabaseUrl,
    supabasePublicKey,
    {
      auth: { autoRefreshToken },
      cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        /**
         * The try/catch guards against attempts to set cookies in environments
         * where Next disallows it (e.g. Server Components). When writes are not
         * allowed we no-op to prevent noisy warnings.
         */
        set(name: string, value: string, options: CookieOptions) {
          if (!allowCookieWrite) return;
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            console.error("Error setting cookie", error);
          }
        },
        remove(name: string, options: CookieOptions) {
          if (!allowCookieWrite) return;
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (error) {
            console.error("Error removing cookie", error);
          }
        },
      },
    }
  );
}
