import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildDemographicsPath,
  hasPendingDemographicQuestions,
} from "@/lib/demographics";
import { createClient } from "@/lib/supabase/server";
import { DEMOGRAPHIC_SKIPS_COOKIE } from "@/lib/demographic-skips";
import { buildNotificationPreferencesPath, fetchNotificationPreferences, notificationNextPath, NOTIFICATION_SKIPS_COOKIE } from "@/lib/notification-preferences";

const FALLBACK_SITE_URL = "http://localhost:3000";

const getConfiguredSiteOrigin = () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!siteUrl) {
    return null;
  }

  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
};

const getRedirectOrigin = (request: Request) => {
  const configuredSiteOrigin = getConfiguredSiteOrigin();

  if (configuredSiteOrigin) {
    return configuredSiteOrigin;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    (forwardedHost?.includes("localhost") ? "http" : "https");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return FALLBACK_SITE_URL;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectOrigin = getRedirectOrigin(request);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const next = notificationNextPath(
    cookieStore.get("login_next")?.value ?? requestUrl.searchParams.get("next")
  );

  if (code) {
    const supabase = await createClient({ allowCookieWrite: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const redirectUrl = new URL("/login", redirectOrigin);
      redirectUrl.searchParams.set(
        "message",
        "Unable to complete sign-in. Please try again."
      );
      return NextResponse.redirect(redirectUrl, 303);
    }

    cookieStore.delete(DEMOGRAPHIC_SKIPS_COOKIE);
    cookieStore.delete(NOTIFICATION_SKIPS_COOKIE);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && (await fetchNotificationPreferences(supabase, user.id)).pending.length) {
      const response = NextResponse.redirect(new URL(buildNotificationPreferencesPath(next), redirectOrigin), 303);
      response.cookies.set({ name: "login_next", value: "", maxAge: 0, path: "/" });
      return response;
    }

    if (user && (await hasPendingDemographicQuestions(supabase, user.id))) {
      const demographicsUrl = new URL(
        buildDemographicsPath({ next }),
        redirectOrigin
      );
      const response = NextResponse.redirect(demographicsUrl, 303);
      response.cookies.set({
        name: "login_next",
        value: "",
        maxAge: 0,
        path: "/",
      });
      return response;
    }
  }

  const redirectUrl = new URL(next, redirectOrigin);
  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set({
    name: "login_next",
    value: "",
    maxAge: 0,
    path: "/",
  });

  return response;
}
