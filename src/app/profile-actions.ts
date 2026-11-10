"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { normalizeRelativePath } from "@/lib/url";
import type { TablesUpdate } from "@/types/supabase";

function normalizeRedirectPath(value: FormDataEntryValue | string | null) {
  const normalized = normalizeRelativePath(value?.toString());

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/";
  }

  return normalized;
}

function withMessage(path: string, message: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("message", message);
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function signOut() {
  const supabase = await createClient({ allowCookieWrite: true });
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function updateProfileName(formData: FormData) {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nextPath = normalizeRedirectPath(formData.get("next"));
  const first = formData.get("first_name")?.toString().trim() ?? "";
  const last = formData.get("last_name")?.toString().trim() ?? "";

  if (first.length < 2 || last.length < 2) {
    redirect(withMessage(nextPath, "Please enter a valid first and last name."));
  }

  const updatePayload: TablesUpdate<"profiles"> = {
    first_name: first,
    last_name: last,
    modified_by_user_id: user.id,
  };
  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

  if (error) {
    redirect(withMessage(nextPath, "We could not save your name. Please try again."));
  }

  redirect(nextPath);
}
