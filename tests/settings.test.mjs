import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadModule(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: path,
  });
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
    loadedModule,
    loadedModule.exports
  );
  return loadedModule.exports;
}

class Redirect extends Error {
  constructor(path) { super(path); this.path = path; }
}

const settingsModule = loadModule("src/lib/account-settings.ts");
const urls = loadModule("src/lib/url.ts");
const notificationModule = loadModule("src/lib/notification-preferences.ts", {
  "@/lib/account-settings": settingsModule, "@/lib/url": urls, "@/lib/supabase/server": {},
});
const phoneModule = loadModule("src/lib/phone-settings.ts");
const submitModule = loadModule("src/components/SubmitButton.tsx");
const Link = ({ children, ...props }) => {
  delete props.prefetch;
  return createElement("a", props, children);
};
const policyLinksModule = loadModule("src/components/PolicyLinks.tsx", { "next/link": { default: Link } });
const authCookieModule = loadModule("src/lib/supabase/authCookies.ts");
const initialProfile = {
  id: "participant-a", first_name: "Test", last_name: "Participant",
  notify_new_study_email: false, notify_new_study_sms: true, notify_new_study_phone_call: false,
};

test("browser, server and proxy ignore shared auth cookies and local logout preserves other apps", async () => {
  const ssr = require("@supabase/ssr");
  const supabaseUrl = "https://fixture.supabase.test";
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = (name) => ({
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: name, exp: expires })}.fixture-signature`,
    refresh_token: `${name}-refresh`, expires_at: expires, token_type: "bearer",
    user: { id: name },
  });
  const legacy = `base64-${encode(session("another-app"))}`;
  const cookieValues = new Map([["sb-fixture-auth-token", legacy]]);
  const cookieStore = {
    get: (name) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
    set: ({ name, value, maxAge }) => { if (!value || maxAge === 0) cookieValues.delete(name); else cookieValues.set(name, value); },
  };
  const logoutRequests = [];
  const fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.pathname, "/auth/v1/logout");
    logoutRequests.push(url.searchParams.get("scope"));
    return new Response(null, { status: 204 });
  };
  const imports = {
    "@/lib/supabase/authCookies": authCookieModule,
    "@/lib/supabase/env": { getSupabasePublicEnv: () => ({ supabaseUrl, supabasePublicKey: "fixture-public-key" }) },
    "next/headers": { cookies: async () => cookieStore },
    "@supabase/ssr": {
      createServerClient: (url, key, options) => ssr.createServerClient(url, key, { ...options, global: { fetch } }),
      createBrowserClient: (url, key, options) => ssr.createBrowserClient(url, key, {
        ...options, isSingleton: false, global: { fetch },
        cookies: { getAll: () => [...cookieValues].map(([name, value]) => ({ name, value })),
          setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set({ name, value, ...options })) },
      }),
    },
    "next/server": { NextResponse: {
      next: () => ({ allowed: true, cookies: { set: cookieStore.set } }),
      redirect: (url) => ({ redirected: url.pathname }),
    } },
  };
  const server = loadModule("src/lib/supabase/server.ts", imports);
  const browser = loadModule("src/lib/supabase/client.ts", imports);
  const { proxy } = loadModule("proxy.ts", imports);
  const request = () => ({ nextUrl: { pathname: "/settings", clone: () => new URL("https://fixture.test/settings") }, headers: {}, cookies: cookieStore });
  for (const client of [await server.createClient(), browser.createClient()]) {
    assert.equal((await client.auth.getSession()).data.session, null);
  }
  assert.deepEqual(await proxy(request()), { redirected: "/login" });
  assert.equal(cookieValues.get("sb-fixture-auth-token"), legacy);

  const own = session("humor-participant");
  const ownCookieName = authCookieModule.getSupabaseAuthCookieOptions(supabaseUrl).name;
  cookieValues.set(ownCookieName, `base64-${encode(own)}`);
  for (const client of [await server.createClient(), browser.createClient()]) {
    assert.equal((await client.auth.getSession()).data.session.access_token, own.access_token);
  }
  assert.equal((await proxy(request())).allowed, true);
  const { signOut } = loadModule("src/app/profile-actions.ts", {
    "@/lib/supabase/server": server, "@/lib/url": urls,
    "next/navigation": { redirect: (path) => { throw new Redirect(path); } },
  });
  await assert.rejects(signOut(), (error) => error instanceof Redirect && error.path === "/login");
  assert.deepEqual(logoutRequests, ["local"]);
  assert.equal(cookieValues.has(ownCookieName), false);
  assert.equal(cookieValues.get("sb-fixture-auth-token"), legacy);
});

function createScenario({ signedIn = true, readError = false, writeError = false, missing = false,
  phoneError = null, userFields = {}, profileFields = {}, notificationSkips, pendingDemographics = false } = {}) {
  const rows = missing ? [] : [
    { ...initialProfile, ...profileFields },
    { ...initialProfile, id: "participant-b", first_name: "Other" },
  ];
  const cookieValues = new Map();
  if (notificationSkips) cookieValues.set(notificationModule.NOTIFICATION_SKIPS_COOKIE, notificationSkips);
  const cookieStore = {
    get: (name) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
    set: (name, value, options) => { cookieValues.set(name, value); cookieOptions.push(options); },
  };
  const cookieOptions = [];
  const requests = [];
  const invalidations = [];
  const clientOptions = [];
  const user = { id: "participant-a", email: "participant@example.test", ...userFields };
  const phoneRequests = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { ...user } : null } }),
      updateUser: async (payload) => {
        phoneRequests.push({ operation: "send", payload });
        if (phoneError) return { data: { user: null }, error: phoneError };
        user.new_phone = payload.phone;
        return { data: { user: { ...user } }, error: null };
      },
      verifyOtp: async (payload) => {
        phoneRequests.push({ operation: "verify", payload });
        if (phoneError || payload.token !== "123456") return { data: { user: null }, error: phoneError || { status: 422 } };
        user.phone = payload.phone;
        user.phone_confirmed_at = "2026-10-04T00:00:00Z";
        user.new_phone = "";
        return { data: { user: { ...user } }, error: null };
      },
    },
    from(table) {
      const request = { table, selection: null, payload: null, filters: [] };
      requests.push(request);
      const query = {
        select(selection) { request.selection = selection; return query; },
        update(payload) { request.payload = payload; return query; },
        eq(key, value) { request.filters.push([key, value]); return query; },
        is(key, value) { request.filters.push([key, value]); return query; },
        execute() {
          if (request.payload ? writeError : readError) return { data: null, error: { message: "Unavailable profile" } };
          const matched = rows.filter((row) => request.filters.every(([key, value]) => row[key] === value));
          if (request.payload) matched.forEach((row) => Object.assign(row, request.payload));
          return { data: matched.map((row) => ({ ...row })), error: null };
        },
        async single() { const result = query.execute(); return { ...result, data: result.data?.[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(query.execute()).then(resolve, reject); },
      };
      return query;
    },
  };
  const imports = {
    "next/headers": { cookies: async () => cookieStore },
    "@/lib/notification-preferences": notificationModule,
    "@/lib/demographic-skips": loadModule("src/lib/demographic-skips.ts"),
    "@/lib/demographics": {
      hasPendingDemographicQuestions: async () => pendingDemographics,
      buildDemographicsPath: ({ next }) => `/demographics?${new URLSearchParams({ next })}`,
    },
    "@/components/SubmitButton": submitModule,
    "@/components/PolicyLinks": policyLinksModule,
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    "next/navigation": { redirect: (path) => { throw new Redirect(path); } },
    "next/link": { default: Link },
    "@/lib/account-settings": settingsModule,
    "@/lib/phone-settings": phoneModule,
    "@/lib/supabase/server": { createClient: async (options) => { clientOptions.push(options); return client; } },
    "@/app/profile-actions": { signOut: async () => {} },
    "@/components/AccountMenu": { AccountMenu: () => null },
  };
  const actions = loadModule("src/app/settings/actions.ts", imports);
  const form = loadModule("src/components/SettingsForm.tsx", {
    "@/app/settings/actions": actions,
    "@/lib/account-settings": settingsModule,
    "./SubmitButton": submitModule,
    "./PolicyLinks": policyLinksModule,
  });
  const phoneActions = loadModule("src/app/settings/phone-actions.ts", imports);
  const phoneForm = loadModule("src/components/PhoneSettingsForm.tsx", {
    "@/app/settings/phone-actions": phoneActions,
    "./SubmitButton": submitModule,
    "./PolicyLinks": policyLinksModule,
  });
  const page = loadModule("src/app/settings/page.tsx", { ...imports, "@/components/SettingsForm": form,
    "@/components/PhoneSettingsForm": phoneForm });
  const notificationActions = loadModule("src/app/notification-preferences/actions.ts", imports);
  const notificationPage = loadModule("src/app/notification-preferences/page.tsx", { ...imports, "./actions": notificationActions }).default;
  return {
    notificationActions, notificationPage, cookieValues, cookieOptions,
    rows, requests, invalidations, clientOptions, user, phoneRequests,
    save: (data) => actions.updateAccountSettings(settingsModule.INITIAL_SETTINGS_STATE, data),
    savePhone: (data) => phoneActions.updatePhoneNumber(phoneModule.phoneSettingsForUser(user), data),
    render: async () => renderToStaticMarkup(await page.default()),
  };
}

function formData({ first = "Jane", last = "Doe", channels = [] } = {}) {
  const data = new FormData();
  data.set("first_name", first);
  data.set("last_name", last);
  settingsModule.NOTIFICATION_SETTINGS.forEach(({ name }) => data.set(name, channels.includes(name) ? "on" : "off"));
  return data;
}

function selectedPreference(html, name) {
  const select = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>(.*?)</select>`))[1];
  return select.match(/<option value="([^"]+)" selected="">/)[1];
}

const unanswered = Object.fromEntries(settingsModule.NOTIFICATION_SETTINGS.map(({ name }) => [name, null]));
function preferenceData(preference = "notify_new_study_email", next = "/study/42") {
  const data = new FormData();
  data.set("preference", preference);
  data.set("next", next);
  return data;
}

test("nullable settings remain unanswered when saving only a name change", async () => {
  const scenario = createScenario({ profileFields: unanswered });
  const html = await scenario.render();
  const data = formData();
  for (const { name } of settingsModule.NOTIFICATION_SETTINGS) {
    assert.equal(selectedPreference(html, name), "unanswered");
    data.set(name, "unanswered");
  }
  assert.equal((await scenario.save(data)).status, "success");
  for (const { name } of settingsModule.NOTIFICATION_SETTINGS) assert.equal(scenario.rows[0][name], null);
});

test("notification prompt displays only unanswered channels and offers Yes, No and Skip", async () => {
  const scenario = createScenario({ profileFields: { notify_new_study_email: true, notify_new_study_sms: null, notify_new_study_phone_call: false } });
  const html = renderToStaticMarkup(await scenario.notificationPage({ searchParams: Promise.resolve({ next: "/study/42" }) }));
  assert.match(html, /Would you like to receive a text message/);
  assert.match(html, /name="preference" value="notify_new_study_sms"/);
  assert.match(html, /name="next" value="\/study\/42"/);
  for (const label of ["Yes", "No", "Skip"]) assert.ok(html.includes(`>${label}</span>`));
});

test("Yes and No save only the selected NULL preference for the authenticated participant", async () => {
  for (const [action, expected] of [["acceptNotification", true], ["declineNotification", false]]) {
    const scenario = createScenario({ profileFields: unanswered });
    const data = preferenceData();
    data.set("id", "participant-b");
    data.set("is_superadmin", "true");
    await assert.rejects(() => scenario.notificationActions[action](data), (error) => error.path === "/notification-preferences?next=%2Fstudy%2F42");
    assert.deepEqual(scenario.requests[0].payload, { notify_new_study_email: expected, modified_by_user_id: "participant-a" });
    assert.deepEqual(scenario.requests[0].filters, [["id", "participant-a"], ["notify_new_study_email", null]]);
    assert.equal(scenario.rows[0].notify_new_study_email, expected);
    assert.equal(scenario.rows[0].notify_new_study_sms, null);
    assert.equal(scenario.rows[0].notify_new_study_phone_call, null);
    assert.equal(scenario.rows[1].notify_new_study_email, false);
  }
});

test("Skip leaves NULL in the database, uses a user-scoped session cookie, and advances the prompt", async () => {
  const scenario = createScenario({ profileFields: unanswered });
  await assert.rejects(() => scenario.notificationActions.skipNotification(preferenceData()), Redirect);
  assert.deepEqual(scenario.requests, []);
  assert.equal(scenario.rows[0].notify_new_study_email, null);
  assert.deepEqual(notificationModule.readNotificationSkips(scenario.cookieValues.get("notification_skips"), "participant-a"), ["notify_new_study_email"]);
  assert.deepEqual(notificationModule.readNotificationSkips(scenario.cookieValues.get("notification_skips"), "participant-b"), []);
  assert.equal(scenario.cookieOptions[0].httpOnly, true);
  assert.equal(scenario.cookieOptions[0].sameSite, "lax");
  assert.equal(scenario.cookieOptions[0].maxAge, undefined);
  assert.match(renderToStaticMarkup(await scenario.notificationPage({})), /Would you like to receive a text message/);
});

test("all skipped choices finish without a home redirect loop and retain NULL preferences", async () => {
  const scenario = createScenario({ profileFields: unanswered });
  for (const { name } of settingsModule.NOTIFICATION_SETTINGS) {
    await assert.rejects(() => scenario.notificationActions.skipNotification(preferenceData(name)), Redirect);
  }
  await assert.rejects(() => scenario.notificationPage({ searchParams: Promise.resolve({ next: "/study/42" }) }), (error) => error.path === "/study/42");
  for (const { name } of settingsModule.NOTIFICATION_SETTINGS) assert.equal(scenario.rows[0][name], null);
});

test("finishing notifications continues pending demographics before the original destination", async () => {
  const scenario = createScenario({ pendingDemographics: true });
  await assert.rejects(() => scenario.notificationPage({ searchParams: Promise.resolve({ next: "/study/42" }) }),
    (error) => error.path === "/demographics?next=%2Fstudy%2F42");
});

test("stale prompt submissions cannot overwrite an answered preference", async () => {
  const scenario = createScenario({ profileFields: { notify_new_study_email: false } });
  await assert.rejects(() => scenario.notificationActions.acceptNotification(preferenceData()), Redirect);
  assert.equal(scenario.rows[0].notify_new_study_email, false);
});

test("invalid preference fields, duplicates and signed-out submissions never update profiles", async () => {
  for (const value of ["is_superadmin", "id", "", new File(["notify_new_study_email"], "choice.txt")]) {
    const scenario = createScenario();
    await assert.rejects(() => scenario.notificationActions.acceptNotification(preferenceData(value)), Redirect);
    assert.deepEqual(scenario.requests, []);
  }
  const scenario = createScenario();
  const data = preferenceData();
  data.append("preference", "notify_new_study_sms");
  await assert.rejects(() => scenario.notificationActions.acceptNotification(data), Redirect);
  assert.deepEqual(scenario.requests, []);
  const signedOut = createScenario({ signedIn: false });
  for (const action of Object.values(signedOut.notificationActions)) {
    await assert.rejects(() => action(preferenceData()), (error) => error.path === "/login");
  }
  assert.deepEqual(signedOut.requests, []);
});

test("failed preference writes retain NULL and show a retry message without skipping", async (t) => {
  t.mock.method(console, "error", () => {});
  const scenario = createScenario({ profileFields: unanswered, writeError: true });
  await assert.rejects(() => scenario.notificationActions.acceptNotification(preferenceData()), (error) => {
    const url = new URL(error.path, "http://localhost");
    return url.searchParams.get("message").includes("couldn’t save");
  });
  assert.equal(scenario.rows[0].notify_new_study_email, null);
  assert.equal(scenario.cookieValues.size, 0);
  assert.deepEqual(scenario.invalidations, []);
});

test("notification return paths cannot redirect off-site or back into the prompt", () => {
  for (const path of ["//evil.test/path", "/\\evil.test", "/notification-preferences?next=/", "/\r\nLocation: evil"]) {
    assert.equal(notificationModule.notificationNextPath(path), "/");
  }
  assert.equal(notificationModule.notificationNextPath("/study/42?test=yes"), "/study/42?test=yes");
  for (const cookie of ["bad-json", "%", "null", JSON.stringify({ profileId: "participant-a", preferences: ["is_superadmin"] })]) {
    assert.deepEqual(notificationModule.readNotificationSkips(cookie, "participant-a"), []);
  }
});

test("settings load only the signed-in profile and hydrate its name and independent preferences", async () => {
  const scenario = createScenario();
  const html = await scenario.render();
  assert.ok(html.includes('name="first_name"') && html.includes('value="Test"'));
  assert.ok(html.includes('name="last_name"') && html.includes('value="Participant"'));
  assert.equal(selectedPreference(html, "notify_new_study_email"), "off");
  assert.equal(selectedPreference(html, "notify_new_study_sms"), "on");
  assert.equal(selectedPreference(html, "notify_new_study_phone_call"), "off");
  assert.ok(html.includes("Save changes") && html.includes('id="settings-content"'));
  assert.deepEqual(scenario.requests[0].filters, [["id", "participant-a"]]);
});

function phoneData(operation, values = {}) {
  const data = new FormData();
  data.set("operation", operation);
  if (operation === "send") data.set("verification_sms_consent", "on");
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("phone verification requests normalize country-coded numbers without changing notification preferences", async () => {
  const scenario = createScenario();
  const result = await scenario.savePhone(phoneData("send", { phone: " +1 (212) 555-1234 " }));
  assert.equal(result.status, "sent");
  assert.equal(result.pendingPhone, "+12125551234");
  assert.deepEqual(scenario.phoneRequests, [{ operation: "send", payload: { phone: "+12125551234" } }]);
  assert.deepEqual(scenario.requests, []);
  assert.deepEqual(scenario.invalidations, [["/settings"]]);
  assert.equal(scenario.rows[0].notify_new_study_email, false);
});

test("verification texts require explicit consent and reject missing, forged, or duplicate choices", async () => {
  for (const choice of [undefined, "off", "true", new File(["on"], "consent.txt")]) {
    const scenario = createScenario();
    const data = phoneData("send", { phone: "+12125551234" });
    if (choice === undefined) data.delete("verification_sms_consent");
    else data.set("verification_sms_consent", choice);
    const result = await scenario.savePhone(data);
    assert.equal(result.status, "error");
    assert.ok(result.message.includes("Agree to receive"));
    assert.deepEqual(scenario.phoneRequests, []);
    assert.deepEqual(scenario.requests, []);
  }
  const scenario = createScenario();
  const data = phoneData("send", { phone: "+12125551234" });
  data.append("verification_sms_consent", "on");
  assert.equal((await scenario.savePhone(data)).status, "error");
  assert.deepEqual(scenario.phoneRequests, []);
});

test("phone verification uses the signed-in account's pending number and reloads verified status", async () => {
  const scenario = createScenario({ userFields: { new_phone: "12125551234" } });
  const result = await scenario.savePhone(phoneData("verify", { code: "123456", phone: "+19995550000", id: "participant-b" }));
  assert.equal(result.status, "verified");
  assert.equal(result.verifiedPhone, "+12125551234");
  assert.equal(result.pendingPhone, "");
  assert.deepEqual(scenario.phoneRequests, [{ operation: "verify", payload: { phone: "+12125551234", token: "123456", type: "phone_change" } }]);
  const html = await scenario.render();
  assert.ok(html.includes("Verified number: +12125551234"));
  assert.ok(!html.includes('name="code"'));
});

test("phone verification errors retain the existing verified and pending numbers", async () => {
  const scenario = createScenario({ userFields: { phone: "12125551234", phone_confirmed_at: "2026-10-03", new_phone: "13105551234" } });
  const result = await scenario.savePhone(phoneData("verify", { code: "000000" }));
  assert.equal(result.status, "error");
  assert.equal(result.verifiedPhone, "+12125551234");
  assert.equal(result.pendingPhone, "+13105551234");
  assert.deepEqual(scenario.invalidations, []);
});

test("missing country codes, malformed numbers, files, and duplicate phone fields never request SMS", async () => {
  for (const phone of ["2125551234", "+0", "+1letters", "", new File(["+12125551234"], "phone.txt")]) {
    const scenario = createScenario();
    assert.equal((await scenario.savePhone(phoneData("send", { phone }))).status, "error");
    assert.deepEqual(scenario.phoneRequests, []);
  }
  const scenario = createScenario();
  const data = phoneData("send", { phone: "+12125551234" });
  data.append("phone", "+13105551234");
  assert.equal((await scenario.savePhone(data)).status, "error");
  assert.deepEqual(scenario.phoneRequests, []);
});

test("malformed codes or missing pending phone numbers cannot verify an account", async () => {
  for (const code of ["123", "abcdef", "", new File(["123456"], "code.txt")]) {
    const scenario = createScenario({ userFields: { new_phone: "12125551234" } });
    assert.equal((await scenario.savePhone(phoneData("verify", { code }))).status, "error");
    assert.deepEqual(scenario.phoneRequests, []);
  }
  const scenario = createScenario();
  assert.equal((await scenario.savePhone(phoneData("verify", { code: "123456" }))).status, "error");
  assert.deepEqual(scenario.phoneRequests, []);
});

test("signed-out phone changes redirect before sending or verifying any code", async () => {
  const scenario = createScenario({ signedIn: false });
  await assert.rejects(() => scenario.savePhone(phoneData("send", { phone: "+12125551234" })), (error) => error.path === "/login");
  await assert.rejects(() => scenario.savePhone(phoneData("verify", { code: "123456" })), (error) => error.path === "/login");
  assert.deepEqual(scenario.phoneRequests, []);
});

test("provider failures and rate limiting do not claim a verification code was sent", async () => {
  for (const status of [429, 500]) {
    const scenario = createScenario({ phoneError: { status } });
    const result = await scenario.savePhone(phoneData("send", { phone: "+12125551234" }));
    assert.equal(result.status, "error");
    assert.equal(result.pendingPhone, "");
    assert.deepEqual(scenario.invalidations, []);
    if (status === 429) assert.ok(result.message.includes("wait a minute"));
  }
});

test("saving trims names, sets all three channels, ignores submitted identity/admin fields, and reloads saved values", async () => {
  const scenario = createScenario();
  const data = formData({ first: "  Jane  ", last: " Doe ", channels: ["notify_new_study_email", "notify_new_study_phone_call"] });
  data.set("id", "participant-b");
  data.set("is_superadmin", "true");
  const result = await scenario.save(data);
  assert.equal(result.status, "success");
  assert.deepEqual(scenario.requests[0].payload, {
    first_name: "Jane", last_name: "Doe", modified_by_user_id: "participant-a",
    notify_new_study_email: true, notify_new_study_sms: false, notify_new_study_phone_call: true,
  });
  assert.deepEqual(scenario.requests[0].filters, [["id", "participant-a"]]);
  assert.equal(scenario.requests[0].selection, "id");
  assert.deepEqual(scenario.clientOptions[0], { allowCookieWrite: true });
  assert.equal(scenario.rows[1].first_name, "Other");
  assert.deepEqual(scenario.invalidations, [["/", "layout"]]);
  const html = await scenario.render();
  assert.ok(html.includes('value="Jane"') && html.includes('value="Doe"'));
  assert.equal(selectedPreference(html, "notify_new_study_email"), "on");
  assert.equal(selectedPreference(html, "notify_new_study_sms"), "off");
});

test("No choices explicitly save false so users can opt out of every notification", async () => {
  const scenario = createScenario();
  assert.equal((await scenario.save(formData({ channels: settingsModule.NOTIFICATION_SETTINGS.map(({ name }) => name) }))).status, "success");
  assert.equal((await scenario.save(formData())).status, "success");
  for (const { name } of settingsModule.NOTIFICATION_SETTINGS) assert.equal(scenario.rows[0][name], false);
});

test("signed-out settings reads and writes redirect before accessing profiles", async () => {
  const scenario = createScenario({ signedIn: false });
  await assert.rejects(scenario.render, (error) => error.path === "/login");
  await assert.rejects(() => scenario.save(formData()), (error) => error.path === "/login");
  assert.deepEqual(scenario.requests, []);
});

test("invalid and whitespace-only names are rejected without any profile write", async () => {
  for (const values of [{ first: " " }, { last: "D" }, { first: "J" }, { last: "" }]) {
    const scenario = createScenario();
    assert.equal((await scenario.save(formData(values))).status, "error");
    assert.deepEqual(scenario.requests, []);
    assert.deepEqual(scenario.invalidations, []);
  }
  const scenario = createScenario();
  const data = formData();
  data.set("first_name", new File(["Jane"], "name.txt"));
  assert.equal((await scenario.save(data)).status, "error");
  assert.deepEqual(scenario.requests, []);
});

test("invalid or duplicate notification choices cannot be interpreted as opt-ins", async () => {
  for (const { name } of settingsModule.NOTIFICATION_SETTINGS) {
    for (const value of ["false", "true", "", new File(["on"], "preference.txt")]) {
      const scenario = createScenario();
      const data = formData();
      data.set(name, value);
      assert.equal((await scenario.save(data)).status, "error");
      assert.deepEqual(scenario.requests, []);
    }
    const scenario = createScenario();
    const data = formData();
    data.append(name, "on");
    assert.equal((await scenario.save(data)).status, "error");
    assert.deepEqual(scenario.requests, []);
  }
});

test("failed or missing profile updates show an error and never report success or invalidate pages", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const options of [{ writeError: true }, { missing: true }]) {
    const scenario = createScenario(options);
    const before = structuredClone(scenario.rows);
    const result = await scenario.save(formData());
    assert.equal(result.status, "error");
    assert.ok(result.message.includes("couldn’t save"));
    assert.deepEqual(scenario.rows, before);
    assert.deepEqual(scenario.invalidations, []);
  }
});

test("settings load failures show a retry state instead of editable guessed defaults", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const options of [{ readError: true }, { missing: true }]) {
    const html = await createScenario(options).render();
    assert.ok(html.includes("couldn’t load your settings") && html.includes("Try again"));
    assert.ok(!html.includes('id="settings-form"'));
  }
});

test("the shared account menu places Settings directly above Sign out", () => {
  const { AccountMenu } = loadModule("src/components/AccountMenu.tsx", {
    react: { ...require("react"), useState: () => [true, () => {}] },
    "next/link": { default: Link },
    "./theme/ThemeProvider": { useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme() {} }) },
    "./SubmitButton": submitModule,
  });
  const html = renderToStaticMarkup(createElement(AccountMenu, { displayName: "Test Participant", signOutAction: async () => {} }));
  assert.ok(html.includes('href="/settings"'));
  assert.ok(html.indexOf("Settings</a>") < html.indexOf("Sign out"));
  assert.ok(html.includes('href="/terms"') && html.includes("Policies &amp; terms"));
});

test("native action resets are cancelled so controlled notification choices remain visible", () => {
  const nativeForm = new EventTarget();
  const effects = [];
  const { SettingsForm } = loadModule("src/components/SettingsForm.tsx", {
    react: {
      ...require("react"),
      useRef: () => ({ current: nativeForm }),
      useEffect: (effect) => effects.push(effect),
    },
    "@/app/settings/actions": { updateAccountSettings: async () => settingsModule.INITIAL_SETTINGS_STATE },
    "@/lib/account-settings": settingsModule,
    "./SubmitButton": submitModule,
    "./PolicyLinks": policyLinksModule,
  });
  renderToStaticMarkup(createElement(SettingsForm, { initialSettings: initialProfile }));
  const cleanup = effects[0]();
  const reset = new Event("reset", { cancelable: true });
  assert.equal(nativeForm.dispatchEvent(reset), false);
  assert.equal(reset.defaultPrevented, true);
  cleanup();
  assert.equal(nativeForm.dispatchEvent(new Event("reset", { cancelable: true })), true);
});

test("Settings and the text opt-in prompt disclose frequency, costs, opt-out and policy links", async () => {
  const scenario = createScenario({ profileFields: { notify_new_study_sms: null } });
  const html = await scenario.render();
  const prompt = renderToStaticMarkup(await scenario.notificationPage({ searchParams: Promise.resolve({ next: "/" }) }));
  for (const markup of [html, prompt]) {
    for (const text of ["Reply STOP", "HELP", "Message and data rates may apply", "at most once daily", 'href="/privacy"', 'href="/sms-terms"']) assert.ok(markup.includes(text), text);
  }
  const consentInput = html.match(/<input[^>]*name="verification_sms_consent"[^>]*>/)?.[0];
  assert.ok(consentInput);
  assert.ok(consentInput.includes('type="checkbox"') && consentInput.includes('required=""'));
  assert.ok(!consentInput.includes("checked"));
  assert.ok(html.includes("does not subscribe you to study reminders"));
});

test("policy pages are public without an Auth lookup and neighboring routes stay protected", async () => {
  let authLookups = 0;
  const { proxy } = loadModule("proxy.ts", {
    "@supabase/ssr": { createServerClient: () => ({ auth: { getSession: async () => { authLookups++; return { data: { session: null } }; } } }) },
    "@/lib/supabase/env": { getSupabasePublicEnv: () => ({ supabaseUrl: "https://fixture.test", supabasePublicKey: "fixture" }) },
    "@/lib/supabase/authCookies": { getSupabaseAuthCookieOptions: () => ({}) },
    "next/server": { NextResponse: { next: () => ({ allowed: true }), redirect: (url) => ({ redirected: url.pathname }) } },
  });
  const request = (path) => ({ nextUrl: { pathname: path, clone: () => new URL(`https://fixture.test${path}`) }, headers: {}, cookies: { get: () => undefined } });
  const policies = ["terms", "privacy", "cookies", "notification-terms", "sms-terms"];
  for (const path of policies) assert.deepEqual(await proxy(request(`/${path}`)), { allowed: true });
  assert.equal(authLookups, 0);
  for (const path of ["/settings", ...policies.flatMap((path) => [`/${path}/admin`, `/${path}-private`])]) {
    assert.deepEqual(await proxy(request(path)), { redirected: "/login" });
  }
  assert.equal(authLookups, 11);
  const policyPageModule = loadModule("src/components/PolicyPage.tsx", { "next/link": { default: Link }, "./PolicyLinks": policyLinksModule });
  for (const path of policies) {
    const page = loadModule(`src/app/${path}/page.tsx`, { "next/link": { default: Link }, "@/components/PolicyPage": policyPageModule });
    const html = renderToStaticMarkup(page.default());
    assert.ok(html.includes("Sparkling Javascript, Inc."));
    assert.ok(html.includes("michael@sparklingjavascript.com"));
    for (const destination of policies) assert.ok(html.includes(`href="/${destination}"`));
    assert.ok(html.includes("overflow-y-auto"));
  }
});

test("sign-in requires an unchecked eligibility and terms choice and distinguishes research consent", () => {
  const { GoogleSignInForm } = loadModule("src/components/GoogleSignInForm.tsx", {
    "next/link": { default: Link }, "./SubmitButton": submitModule,
  });
  const html = renderToStaticMarkup(createElement(GoogleSignInForm, { next: "/study/42", icon: null }));
  const choice = html.match(/<input[^>]*name="site_terms"[^>]*>/)?.[0];
  assert.ok(choice?.includes('type="checkbox"') && choice.includes('required=""'));
  assert.ok(!choice.includes("checked"));
  assert.ok(html.includes("18 years old") && html.includes("United States"));
  assert.ok(html.includes('href="/terms"') && html.includes('href="/privacy"'));
  assert.ok(html.includes("Research consent and optional notification choices are separate"));
});

test("OAuth rejects absent or forged terms choices before contacting Auth and preserves the destination", async () => {
  let authCalls = 0;
  const { POST } = loadModule("src/app/auth/login/route.ts", {
    "@/lib/url": urls,
    "@/lib/supabase/server": { createClient: async () => { authCalls++; throw new Error("Must not contact Auth"); } },
    "next/server": { NextResponse: { redirect: (url, status) => ({ location: String(url), status }) } },
  });
  for (const choices of [[], ["off"], ["true"], ["on", "on"], [new File(["on"], "terms.txt")]]) {
    const data = new FormData();
    data.set("next", "/study/42");
    choices.forEach((value) => data.append("site_terms", value));
    const result = await POST(new Request("https://fixture.test/auth/login", { method: "POST", body: data }));
    assert.equal(result.status, 303);
    const redirect = new URL(result.location);
    assert.equal(redirect.pathname, "/login");
    assert.equal(redirect.searchParams.get("redirectedFrom"), "/study/42");
    assert.ok(redirect.searchParams.get("message").includes("18 or older"));
  }
  assert.equal(authCalls, 0);
});

test("accepted site terms keep the clean OAuth callback and do not write notification preferences", async () => {
  const previousGoogle = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const previousSite = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "fixture-google-client";
  process.env.NEXT_PUBLIC_SITE_URL = "https://fixture.test";
  const options = [];
  const calls = [];
  const cookies = [];
  try {
    const { POST } = loadModule("src/app/auth/login/route.ts", {
      "@/lib/url": urls,
      "@/lib/supabase/server": { createClient: async (option) => {
        options.push(option);
        return { auth: { signInWithOAuth: async (call) => { calls.push(call); return { data: { url: "https://accounts.google.test/authorize" }, error: null }; } } };
      } },
      "next/server": { NextResponse: { redirect: (url, status) => ({ location: String(url), status, cookies: { set: (cookie) => cookies.push(cookie) } }) } },
    });
    const data = new FormData();
    data.set("site_terms", "on");
    data.set("next", "/study/42");
    data.set("notify_new_study_email", "on");
    const result = await POST(new Request("https://internal.test/auth/login", { method: "POST", body: data }));
    assert.equal(result.status, 303);
    assert.equal(result.location, "https://accounts.google.test/authorize");
    assert.deepEqual(options, [{ allowCookieWrite: true, autoRefreshToken: false }]);
    assert.deepEqual(calls, [{ provider: "google", options: { redirectTo: "https://fixture.test/auth/callback", queryParams: { client_id: "fixture-google-client" } } }]);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, "login_next");
    assert.equal(cookies[0].value, "/study/42");
    assert.equal(cookies[0].httpOnly, true);
  } finally {
    if (previousGoogle === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID; else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = previousGoogle;
    if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = previousSite;
  }
});
