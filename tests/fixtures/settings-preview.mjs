// Run the real Next.js settings flow against an in-memory Supabase fixture.
// Both services bind to loopback, and every Supabase request stays local.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const appOrigin = "http://127.0.0.1:3014";
const apiOrigin = "http://127.0.0.1:3015";
mkdirSync(".next-settings-preview", { recursive: true });
writeFileSync(".next-settings-preview/tsconfig.json", JSON.stringify({
  extends: "../tsconfig.json",
  compilerOptions: { baseUrl: ".." },
  include: ["../next-env.d.ts", "../src/**/*.ts", "../src/**/*.tsx", "types/**/*.ts", "dev/types/**/*.ts"],
  exclude: ["../node_modules"],
}, null, 2));
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "participant@example.test", aud: "authenticated", role: "authenticated",
  app_metadata: { provider: "google" }, user_metadata: {}, created_at: "2026-10-03T00:00:00Z",
  phone: "", new_phone: "",
};
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
  sub: user.id, email: user.email, aud: user.aud, role: user.role,
  exp: expiresAt, iat: expiresAt - 3600, iss: `${apiOrigin}/auth/v1`,
})}.fixture-signature`;
const session = {
  access_token: accessToken, refresh_token: "settings-preview-refresh",
  expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user,
};
const profile = {
  id: user.id, first_name: "Test", last_name: "Participant",
  notify_new_study_email: false, notify_new_study_sms: true, notify_new_study_phone_call: false,
};
const writes = [];
let failNextSave = false;
let failReads = false;

function respond(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const api = createServer(async (request, response) => {
  const url = new URL(request.url, apiOrigin);
  if (url.pathname === "/sign-in") {
    response.writeHead(302, {
      "Set-Cookie": `sb-127-funnystudy-auth-token=base64-${encode(session)}; Path=/; HttpOnly; SameSite=Lax`,
      Location: `${appOrigin}${url.searchParams.get("next") === "/" ? "/" : "/settings"}`,
    });
    response.end();
    return;
  }
  if (url.pathname === "/state") return respond(response, 200, { profile, writes, phone: user.phone, pendingPhone: user.new_phone });
  if (url.pathname === "/reset-notification-preferences") {
    for (const key of ["notify_new_study_email", "notify_new_study_sms", "notify_new_study_phone_call"]) profile[key] = null;
    return respond(response, 200, { profile });
  }
  if (url.pathname === "/fail-next-save") {
    failNextSave = true;
    return respond(response, 200, { failNextSave });
  }
  if (url.pathname === "/fail-reads" || url.pathname === "/restore-reads") {
    failReads = url.pathname === "/fail-reads";
    return respond(response, 200, { failReads });
  }

  const verificationWithPublicKey = url.pathname === "/auth/v1/verify"
    && request.headers.apikey === "settings-preview-public-key";
  if (request.headers.authorization !== `Bearer ${accessToken}` && !verificationWithPublicKey) {
    return respond(response, 401, { message: "Fixture authentication required" });
  }
  console.log(`Fixture request: ${request.method} ${url.pathname}`);
  if (url.pathname === "/auth/v1/user") {
    if (request.method === "PUT") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const update = JSON.parse(body);
      if (typeof update.phone !== "string" || !/^\+[1-9]\d{1,14}$/.test(update.phone)) {
        return respond(response, 400, { msg: "Invalid fixture phone" });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      user.new_phone = update.phone;
    }
    return respond(response, 200, user);
  }
  if (url.pathname === "/auth/v1/verify") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const verification = JSON.parse(body);
    if (verification.type !== "phone_change" || verification.phone !== user.new_phone || verification.token !== "123456") {
      return respond(response, 403, { msg: "Invalid fixture code", error_code: "otp_expired" });
    }
    user.phone = user.new_phone;
    user.new_phone = "";
    user.phone_confirmed_at = new Date().toISOString();
    return respond(response, 200, { ...session, user });
  }
  if (url.pathname === "/auth/v1/logout") return respond(response, 200, {});
  if (url.pathname === "/rest/v1/profiles") {
    if (url.searchParams.get("id") !== `eq.${user.id}`) {
      return respond(response, 403, { message: "Fixture profile scope mismatch" });
    }
    if (request.method === "PATCH") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const update = JSON.parse(body);
      const fields = ["first_name", "last_name", "notify_new_study_email", "notify_new_study_sms", "notify_new_study_phone_call", "modified_by_user_id"];
      if (Object.keys(update).some((key) => !fields.includes(key)) || update.modified_by_user_id !== user.id) {
        return respond(response, 403, { message: "Fixture rejected an unauthorized field" });
      }
      // Keep pending feedback visible long enough to inspect in the browser.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (failNextSave) {
        failNextSave = false;
        return respond(response, 500, { code: "FIXTURE_WRITE_FAILURE", message: "Fixture save failed" });
      }
      for (const key of Object.keys(profile)) {
        if (url.searchParams.get(key) === "is.null" && profile[key] !== null) return respond(response, 200, []);
      }
      Object.assign(profile, update);
      writes.push(update);
      console.log("Fixture saved the signed-in profile.");
    } else if (failReads) {
      return respond(response, 500, { code: "FIXTURE_READ_FAILURE", message: "Fixture load failed" });
    }
    const selected = Object.fromEntries((url.searchParams.get("select") || "id").split(",").map((key) => [key, profile[key]]));
    return respond(response, 200, request.headers.accept?.includes("application/vnd.pgrst.object+json") ? selected : [selected]);
  }
  if (url.pathname.startsWith("/rest/v1/")) return respond(response, 200, []);
  respond(response, 404, { message: "Unknown settings preview endpoint" });
});

api.listen(3015, "127.0.0.1", () => {
  console.log(`Settings preview sign-in: ${apiOrigin}/sign-in`);
  const next = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3014"], {
    stdio: "inherit",
    env: {
      ...process.env,
      FUNNYSTUDY_SETTINGS_PREVIEW: "1",
      NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "settings-preview-public-key",
      NEXT_PUBLIC_SITE_URL: appOrigin,
    },
  });
  const stop = () => { next.kill("SIGTERM"); api.close(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", (code) => api.close(() => process.exit(code ?? 0)));
});
