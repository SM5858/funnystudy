import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/authCookies";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { supabaseUrl, supabasePublicKey } = getSupabasePublicEnv();

  return createBrowserClient(supabaseUrl, supabasePublicKey, { cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl) });
}
