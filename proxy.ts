import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/authCookies";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

const publicPolicyRoutes = ["/terms", "/privacy", "/cookies", "/notification-terms", "/sms-terms"];
const publicRoutes = ["/login", "/auth/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  // Policy pages must be readable without an account or an Auth round trip.
  if (publicPolicyRoutes.includes(request.nextUrl.pathname)) return NextResponse.next();
  // Let API routes handle their own auth and errors.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { supabaseUrl, supabasePublicKey } = getSupabasePublicEnv();
  const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route));

  if (!session && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (session && path.startsWith("/login")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
