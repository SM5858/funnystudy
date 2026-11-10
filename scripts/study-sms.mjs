// Fixed administrative operations for this app's private SMS scheduler.
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const projects = {
  production: { ref: "kglxxmrvmrxiyigarjfh", site: "https://www.humorstudy.org" },
  staging: { ref: "qihsgnfjqmkjmoowyfbn", site: process.env.STUDY_SMS_STAGING_SITE_URL },
};
const [operation, environment] = process.argv.slice(2);
const project = projects[environment];
if (!project || !["provider-status", "registration-status", "campaign-status", "register-campaign", "messaging-responses", "provision", "register-brand", "status", "migrate", "check", "configure", "enable", "disable", "test-scheduler"].includes(operation)) {
  throw new Error("Usage: study-sms.mjs provider-status|registration-status|campaign-status|register-campaign|messaging-responses|provision|register-brand|status|migrate|check|configure|enable|disable|test-scheduler production|staging");
}
const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
function safeMessage(message) {
  for (const secret of [process.env.TELNYX_API_KEY, process.env.SUPABASE_ACCESS_TOKEN]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message;
}
async function api(url, token, method = "GET", body) {
  if (!token) throw new Error("The required administrative credential is missing.");
  const response = await fetch(url, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(safeMessage(`Administrative API request failed (HTTP ${response.status}, code ${data.errors?.[0]?.code || data.code || "unavailable"}): ${data.errors?.[0]?.title || data.title || data.message || "Request rejected"}`));
  return data;
}
const telnyx = (path, method, body) => api(`https://api.telnyx.com/v2/${path}`, process.env.TELNYX_API_KEY, method, body);
const database = (query, readOnly = false) => api(`https://api.supabase.com/v1/projects/${project.ref}/database/query`,
  process.env.SUPABASE_ACCESS_TOKEN, "POST", { query, read_only: readOnly });
const authConfig = (method, body) => api(`https://api.supabase.com/v1/projects/${project.ref}/config/auth`,
  process.env.SUPABASE_ACCESS_TOKEN, method, body);
const hookUri = "pg-functions://postgres/funnystudy_notifications/send_sms_auth_hook";
const campaignReference = "funnystudy-production-study-sms-v1";

function messagingResponses() {
  const contact = process.env.TELNYX_BRAND_EMAIL;
  if (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new Error("The registered support email is required.");
  return [
    { op: "start", keywords: ["START", "UNSTOP"], resp_text: "Humor Study: Text delivery is enabled. Study reminders require Yes for Text message in Settings. Up to 1 daily. Msg & data rates may apply. Reply STOP to stop, HELP for help." },
    { op: "stop", keywords: ["STOP", "STOPALL", "END", "CANCEL", "UNSUBSCRIBE", "QUIT"], resp_text: "Humor Study: You have opted out of texts from this number. Reply START to allow texts again." },
    { op: "info", keywords: ["HELP", "INFO"], resp_text: `Humor Study: For help, contact ${contact}. Manage reminders at ${project.site}/settings. Reply STOP to stop texts.` },
  ];
}

async function brandCampaigns(brandId) {
  const campaigns = [];
  for (let page = 1; ; page++) {
    const result = await telnyx(`10dlc/campaign?brandId=${encodeURIComponent(brandId)}&recordsPerPage=100&page=${page}`);
    if (!Array.isArray(result.records) || !Number.isInteger(result.totalRecords)) throw new Error("The campaign list response is incomplete; refusing a duplicate paid submission.");
    campaigns.push(...result.records);
    if (campaigns.length >= result.totalRecords) return campaigns;
    if (!result.records.length) throw new Error("Campaign pagination ended before all records were retrieved.");
  }
}

function reportCampaign(campaign, reused) {
  console.log(JSON.stringify({ campaign_id: campaign.campaignId, tcr_campaign_id: campaign.tcrCampaignId,
    usecase: campaign.usecase, status: campaign.status, submission_status: campaign.submissionStatus,
    campaign_status: campaign.campaignStatus, has_failure_reasons: Boolean(campaign.failureReasons),
    reference_id: campaign.referenceId, ...(reused === undefined ? {} : { reused }) }, null, 2));
}

async function verifyPublishedConsentPages() {
  const pages = [
    { path: "/privacy", required: ["Privacy Policy", "Sparkling Javascript, Inc.", "Mobile information and consent"] },
    { path: "/sms-terms", required: ["SMS Terms", "Verification codes and reminder consent", "How to stop or resume texts"] },
    { path: "/login", required: ["/privacy", "/sms-terms"] },
  ];
  const results = await Promise.allSettled(pages.map(async ({ path, required }) => {
    const response = await fetch(`${project.site}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) throw new Error(`Publish ${project.site}${path} before submitting the campaign (HTTP ${response.status}).`);
    const html = await response.text();
    if (!required.every((text) => html.includes(text))) throw new Error(`The published ${path} page does not contain this application's consent release.`);
  }));
  for (const result of results) if (result.status === "rejected") throw result.reason;
}

async function findRegisteredBrand(ein) {
  const configuredId = process.env.TELNYX_BRAND_ID;
  if (configuredId) {
    const brand = await telnyx(`10dlc/brand/${encodeURIComponent(configuredId)}`);
    if (brand.ein?.replace(/\D/g, "") !== ein) throw new Error("The configured brand does not match the organization's EIN.");
    return brand;
  }
  const brands = await telnyx("10dlc/brand?recordsPerPage=100");
  // List responses can omit the EIN. Retrieve matching candidates before
  // creating anything so a repeated setup cannot charge for another brand.
  const candidates = (brands.records || []).filter((brand) =>
    brand.ein?.replace(/\D/g, "") === ein || brand.displayName === "Humor Study");
  for (const candidate of candidates) {
    const brand = await telnyx(`10dlc/brand/${encodeURIComponent(candidate.brandId)}`);
    if (brand.ein?.replace(/\D/g, "") === ein) return brand;
  }
  return null;
}

async function validateSender(sender, profileId, requireCampaign = true) {
  const numbers = await telnyx(`phone_numbers/messaging?filter[phone_number]=${encodeURIComponent(sender)}&page[size]=100`);
  const number = numbers.data.find((number) => number.phone_number === sender);
  if (!number || number.messaging_profile_id !== profileId || !["longcode", "long-code"].includes(number.type)) {
    throw new Error("The sender must be an owned local Telnyx number assigned to this messaging profile.");
  }
  const profile = await telnyx(`messaging_profiles/${profileId}`);
  if (!profile.data.enabled) throw new Error("The Telnyx messaging profile is disabled.");
  if (requireCampaign && sender.startsWith("+1")) {
    const campaigns = await telnyx("10dlc/phone_number_campaigns?recordsPerPage=100");
    const campaign = campaigns.records?.find((campaign) => campaign.phoneNumber === sender || campaign.phone_number === sender);
    if (!campaign || !["ASSIGNED", "assigned"].includes(campaign.assignmentStatus ?? campaign.assignment_status)) {
      throw new Error("The local US sending number needs an assigned, approved 10DLC campaign before delivery can be enabled.");
    }
  }
  return number;
}

async function main() {
  if (operation === "provider-status") {
    const results = await Promise.allSettled([
      telnyx("phone_numbers/messaging?page[size]=100"),
      telnyx("messaging_profiles?page[size]=100"),
      telnyx("10dlc/phone_number_campaigns?recordsPerPage=100"),
      telnyx("10dlc/brand?recordsPerPage=100"),
      telnyx("balance"),
      telnyx(`messaging_profiles/${process.env.TELNYX_MESSAGING_PROFILE_ID}/autoresp_configs`),
    ]);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") { console.log(`${["numbers", "profiles", "campaigns", "brands", "balance", "responses"][i]}: ${safeMessage(result.reason.message)}`); process.exitCode = 1; continue; }
      if (i === 0) console.log(JSON.stringify({ numbers: result.value.data.map(({ id, phone_number, type, messaging_profile_id }) => ({ id, phone_number, type, messaging_profile_id })) }, null, 2));
      if (i === 1) console.log(JSON.stringify({ profiles: result.value.data.map(({ id, name, enabled }) => ({ id, name, enabled })) }, null, 2));
      if (i === 2) console.log(JSON.stringify({ campaigns: (result.value.records || []).map(({ phoneNumber, campaignId, assignmentStatus }) => ({ phoneNumber, campaignId, assignmentStatus })) }, null, 2));
      if (i === 3) console.log(JSON.stringify({ brands: (result.value.records || []).map(({ brandId, displayName, identityStatus, status, tcrBrandId }) => ({ brandId, displayName, identityStatus, status, tcrBrandId })) }, null, 2));
      if (i === 4) {
        const { balance, available_credit, credit_limit, currency } = result.value.data;
        console.log(JSON.stringify({ balance: { balance, available_credit, credit_limit, currency } }, null, 2));
      }
      if (i === 5) console.log(JSON.stringify({ responses: result.value.data.map(({ op, keywords, country_code }) => ({ op, keywords, country_code })) }, null, 2));
    }
  } else if (operation === "registration-status") {
    if (environment !== "production") throw new Error("Brand registration checks are scoped to production.");
    const ein = process.env.TELNYX_BRAND_EIN?.replace(/\D/g, "");
    if (!ein) throw new Error("The legal organization's EIN is required in the ignored operator environment.");
    const brand = await findRegisteredBrand(ein);
    if (!brand) throw new Error("No brand is registered for the configured organization.");
    console.log(JSON.stringify({ brand_id: brand.brandId, tcr_brand_id: brand.tcrBrandId,
      status: brand.status, identity_status: brand.identityStatus,
      has_failure_reasons: Boolean(brand.failureReasons), assigned_campaigns: brand.assignedCampaignsCount }, null, 2));
    if (brand.status !== "OK" || !["VERIFIED", "VETTED_VERIFIED"].includes(brand.identityStatus)) return;
    const results = await Promise.allSettled(["MIXED", "LOW_VOLUME"].map((usecase) =>
      telnyx(`10dlc/campaignBuilder/brand/${encodeURIComponent(brand.brandId)}/usecase/${usecase}`)));
    for (const result of results) {
      if (result.status === "rejected") { console.log(safeMessage(result.reason.message)); process.exitCode = 1; continue; }
      const { usecase, monthlyFee, quarterlyFee, annualFee, minSubUsecases, maxSubUsecases } = result.value;
      console.log(JSON.stringify({ usecase, monthlyFee, quarterlyFee, annualFee, minSubUsecases, maxSubUsecases }, null, 2));
    }
  } else if (operation === "messaging-responses") {
    if (environment !== "production") throw new Error("Messaging keyword setup is scoped to production.");
    const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
    await validateSender(process.env.TELNYX_FROM_NUMBER, profileId, false);
    const profile = (await telnyx(`messaging_profiles/${profileId}`)).data;
    if (profile.name !== "Humor Study daily reminders") throw new Error("Keyword setup must use this application's dedicated messaging profile.");
    const configs = (await telnyx(`messaging_profiles/${profileId}/autoresp_configs`)).data;
    for (const response of messagingResponses()) {
      const existing = configs.find((config) => config.op === response.op && config.country_code === "US");
      const body = { country_code: "US", ...response };
      if (existing) await telnyx(`messaging_profiles/${profileId}/autoresp_configs/${existing.id}`, "PATCH", body);
      else await telnyx(`messaging_profiles/${profileId}/autoresp_configs`, "POST", body);
    }
    console.log("production: US START, STOP, and HELP responses configured for the dedicated profile. No text sent.");
  } else if (["register-campaign", "campaign-status"].includes(operation)) {
    if (environment !== "production") throw new Error("Campaign registration is scoped to production.");
    const ein = process.env.TELNYX_BRAND_EIN?.replace(/\D/g, "");
    if (!ein) throw new Error("The legal organization's EIN is required in the ignored operator environment.");
    const brand = await findRegisteredBrand(ein);
    if (!brand) throw new Error("Register the organization's brand before creating a campaign.");
    const campaigns = await brandCampaigns(brand.brandId);
    if (operation === "campaign-status") {
      if (!campaigns.length) console.log("production: no campaigns registered for this brand.");
      for (const campaign of campaigns) reportCampaign(campaign);
      return;
    }
    const existing = campaigns.find((campaign) => campaign.referenceId === campaignReference);
    if (existing) { reportCampaign(existing, true); return; }
    if (campaigns.length) throw new Error("This brand already has a campaign; inspect it before creating another paid registration.");
    if (brand.status !== "OK" || !["VERIFIED", "VETTED_VERIFIED"].includes(brand.identityStatus)) throw new Error("The brand must be verified before campaign submission.");
    await verifyPublishedConsentPages();
    await validateSender(process.env.TELNYX_FROM_NUMBER, process.env.TELNYX_MESSAGING_PROFILE_ID, false);
    const responses = messagingResponses();
    const configs = (await telnyx(`messaging_profiles/${process.env.TELNYX_MESSAGING_PROFILE_ID}/autoresp_configs`)).data;
    for (const response of responses) {
      if (!configs.some((config) => config.country_code === "US" && config.op === response.op
        && config.resp_text === response.resp_text && response.keywords.every((keyword) => config.keywords.includes(keyword)))) {
        throw new Error("Configure the documented START, STOP, and HELP responses before registration.");
      }
    }
    const qualification = await telnyx(`10dlc/campaignBuilder/brand/${encodeURIComponent(brand.brandId)}/usecase/LOW_VOLUME`);
    if (qualification.usecase !== "LOW_VOLUME" || Number(qualification.quarterlyFee) !== 4.5
      || qualification.minSubUsecases > 2 || qualification.maxSubUsecases < 2) throw new Error("Low-volume qualification or the selected fees have changed; review before submitting.");
    const balance = (await telnyx("balance")).data;
    if (balance.currency !== "USD" || Number(balance.available_credit) < 19.5) throw new Error("At least USD 19.50 is needed for the selected campaign and review fees.");
    // Telnyx requires a unique referenceId, preventing duplicate charges even
    // if a previous successful POST timed out before its response was recorded.
    const campaign = await telnyx("10dlc/campaignBuilder", "POST", {
      brandId: brand.brandId, referenceId: campaignReference, usecase: "LOW_VOLUME",
      subUsecases: ["POLLING_VOTING", "2FA"], autoRenewal: true,
      description: "Humor Study sends registered participants daily reminders at noon Eastern when an active public humor study remains unfinished, only after they opt into Text message notifications. It also sends one-time codes requested by participants to verify a phone number. Verification alone does not subscribe a participant to study reminders.",
      messageFlow: `Participants sign in with Google at ${project.site}/login. In ${project.site}/settings or the post-login notification prompt, they explicitly choose Yes for Text message to consent to automated study-reminder texts. No and Skip do not subscribe them; preferences default to unanswered. Beside these choices we disclose at most one daily reminder at noon Eastern when an active public study remains unfinished, that texts are optional, message/data rates may apply, STOP to stop and HELP for help, with public links to ${project.site}/privacy and ${project.site}/sms-terms. In Settings, users separately enter their phone number with country code and check an initially unchecked, required box agreeing to automated verification texts before requesting a code. The number-entry form also shows these policy links, rates, STOP/HELP, and that code requests do not subscribe them to reminders. Users enter the code to verify ownership. Only accounts with Yes for Text message and a verified number receive reminders. Users may choose No in Settings or reply STOP to opt out. START unblocks delivery but daily reminders still require the Settings preference to be Yes.`,
      sample1: `Humor Study: A public study is waiting for you to finish. ${project.site}/ Manage reminders: ${project.site}/settings. Reply STOP to opt out.`,
      sample2: "Humor Study: Your verification code is 123456. Do not share this code.",
      optinKeywords: responses[0].keywords.join(","), optinMessage: responses[0].resp_text,
      optoutKeywords: responses[1].keywords.join(","), optoutMessage: responses[1].resp_text,
      helpKeywords: responses[2].keywords.join(","), helpMessage: responses[2].resp_text,
      subscriberOptin: true, subscriberOptout: true, subscriberHelp: true,
      embeddedLink: true, embeddedLinkSample: `${project.site}/`, embeddedPhone: false,
      numberPool: false, ageGated: false, directLending: false, termsAndConditions: true,
      privacyPolicyLink: `${project.site}/privacy`, termsAndConditionsLink: `${project.site}/sms-terms`,
    });
    reportCampaign(campaign, false);
    console.log("production: campaign submitted for provider review. SMS delivery and phone verification remain disabled until approval and number assignment.");
  } else if (operation === "provision") {
    if (environment !== "production") throw new Error("Number purchases are scoped to production.");
    const name = "Humor Study daily reminders";
    const profiles = await telnyx("messaging_profiles?page[size]=100");
    let profile = profiles.data.find((profile) => profile.name === name);
    if (!profile) profile = (await telnyx("messaging_profiles", "POST", {
      name, enabled: true, whitelisted_destinations: ["*"],
    })).data;
    else if (!profile.whitelisted_destinations?.includes("*")) {
      await telnyx(`messaging_profiles/${profile.id}`, "PATCH", { whitelisted_destinations: ["*"] });
    }
    const numbers = await telnyx(`phone_numbers/messaging?filter[messaging_profile_id]=${profile.id}&page[size]=100`);
    const existing = numbers.data.find((number) => ["longcode", "long-code"].includes(number.type));
    if (existing) {
      console.log(JSON.stringify({ sender: existing.phone_number, messaging_profile_id: profile.id, reused: true })); return;
    }
    const orders = await telnyx("number_orders?filter[customer_reference]=funnystudy-production-sms&page[size]=100");
    const pending = orders.data.find((order) => order.customer_reference === "funnystudy-production-sms" && ["pending", "success", "partial_success"].includes(order.status));
    if (pending) {
      console.log(JSON.stringify({ order_id: pending.id, status: pending.status, messaging_profile_id: profile.id, reused_order: true })); return;
    }
    const available = await telnyx("available_phone_numbers?filter[country_code]=US&filter[phone_number_type]=local&filter[features][]=sms&filter[limit]=1");
    if (!available.data.length) throw new Error("No SMS-capable local US number is currently available.");
    const sender = available.data[0].phone_number;
    const order = await telnyx("number_orders", "POST", {
      phone_numbers: [{ phone_number: sender }], messaging_profile_id: profile.id,
      customer_reference: "funnystudy-production-sms",
    });
    console.log(JSON.stringify({ sender, messaging_profile_id: profile.id, order_id: order.data.id, status: order.data.status }, null, 2));
  } else if (operation === "register-brand") {
    if (environment !== "production") throw new Error("Brand registration is scoped to production.");
    const fields = ["LEGAL_NAME", "EIN", "STREET", "CITY", "STATE", "POSTAL_CODE", "WEBSITE", "CONTACT_NAME", "EMAIL", "PHONE"];
    const details = Object.fromEntries(fields.map((field) => [field, process.env[`TELNYX_BRAND_${field}`]]));
    if (Object.values(details).some((value) => !value)) throw new Error("The legal organization's registration details are required in the operator environment.");
    const existing = await findRegisteredBrand(details.EIN.replace(/\D/g, ""));
    let brand = existing;
    if (!brand) {
      const [firstName, ...rest] = details.CONTACT_NAME.split(" ");
      brand = await telnyx("10dlc/brand", "POST", {
        country: "US", displayName: "Humor Study", companyName: details.LEGAL_NAME,
        entityType: "PRIVATE_PROFIT", vertical: "TECHNOLOGY", ein: details.EIN.replace(/\D/g, ""),
        street: details.STREET, city: details.CITY, state: details.STATE, postalCode: details.POSTAL_CODE,
        website: details.WEBSITE, email: details.EMAIL, businessContactEmail: details.EMAIL,
        phone: details.PHONE, firstName, lastName: rest.join(" "), isReseller: false,
      });
    }
    console.log(JSON.stringify({ brand_id: brand.brandId, identity_status: brand.identityStatus,
      status: brand.status, reused: Boolean(existing) }, null, 2));
  } else if (operation === "migrate") {
    for (const file of ["20261004005400_prepare_daily_study_sms_reminders.sql", "20261004010000_hash_verification_codes_without_extension_access.sql"]) {
      const version = file.split("_")[0];
      if ((await database(`select version from supabase_migrations.schema_migrations where version = ${sqlString(version)};`, true)).length) {
        console.log(`${environment}: ${version} already applied.`); continue;
      }
      const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
      await database(`begin;\n${sql}\ninsert into supabase_migrations.schema_migrations(version,name,statements)
        values (${sqlString(version)},${sqlString(file.slice(version.length + 1, -4))},array[${sqlString(sql)}]);\ncommit;`);
      console.log(`${environment}: installed ${file}.`);
    }
  } else if (operation === "check") {
    await database(await readFile(new URL("../supabase/tests/daily_study_sms.sql", import.meta.url), "utf8"));
    console.log(`${environment}: SMS database checks passed. HTTP was mocked; all fixtures rolled back.`);
  } else if (operation === "configure") {
    const sender = process.env.TELNYX_FROM_NUMBER;
    const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
    if (!sender || !profileId || !project.site) throw new Error("TELNYX_FROM_NUMBER, TELNYX_MESSAGING_PROFILE_ID, and the environment's site URL are required.");
    await validateSender(sender, profileId, false);
    await database(`begin;
      do $$ declare secret_id uuid; begin
        select id into secret_id from vault.secrets where name = 'funnystudy_telnyx_api_key';
        if secret_id is null then perform vault.create_secret(${sqlString(process.env.TELNYX_API_KEY)}, 'funnystudy_telnyx_api_key');
        else perform vault.update_secret(secret_id, ${sqlString(process.env.TELNYX_API_KEY)}); end if;
      end; $$;
      update funnystudy_notifications.sms_config set enabled=false, verification_enabled=false,
        sender=${sqlString(sender)}, messaging_profile_id=${sqlString(profileId)}::uuid, site_url=${sqlString(project.site)};
      commit;`);
    console.log(`${environment}: validated the local sender and saved the credential in Vault. Sending remains disabled.`);
  } else if (operation === "enable") {
    const [config] = await database("select * from funnystudy_notifications.sms_config;", true);
    await validateSender(config.sender, config.messaging_profile_id);
    const auth = await authConfig();
    if (auth.hook_send_sms_enabled && auth.hook_send_sms_uri !== hookUri) throw new Error("An existing SMS Auth hook is configured; it cannot be overwritten automatically.");
    await database(`do $$ begin
      if current_setting('cron.timezone', true) not in ('GMT','UTC')
        or not exists(select 1 from vault.decrypted_secrets where name='funnystudy_telnyx_api_key' and decrypted_secret <> '')
      then raise exception 'SMS needs a Vault credential and UTC/GMT cron timezone'; end if;
    end; $$;
    update funnystudy_notifications.sms_config set enabled=true, verification_enabled=true;`);
    await authConfig("PATCH", { external_phone_enabled: true, sms_autoconfirm: false, sms_otp_length: 6,
      hook_send_sms_enabled: true, hook_send_sms_uri: hookUri });
    await database(`select cron.alter_job(job_id := (select jobid from cron.job where jobname='funnystudy-sms-noon'), active := true);`);
    console.log(`${environment}: Telnyx phone verification and daily noon Eastern reminders enabled.`);
  } else if (operation === "disable") {
    await database(`update funnystudy_notifications.sms_config set enabled=false;
      select cron.alter_job(job_id := (select jobid from cron.job where jobname='funnystudy-sms-noon'), active := false);`);
    console.log(`${environment}: daily SMS reminders paused. Phone verification is unchanged.`);
  } else if (operation === "test-scheduler") {
    const [started] = await database(`do $$ begin
      if exists (select 1 from funnystudy_notifications.sms_deliveries where status in ('queued','sending'))
      then raise exception 'The scheduler check requires an empty pending queue'; end if;
    end; $$;
    select cron.alter_job(job_id := (select jobid from cron.job where jobname='funnystudy-sms-delivery'), active := true);
    select clock_timestamp() as started_at;`);
    for (let attempt = 0; attempt < 30; attempt++) {
      await setTimeout(1000);
      const [run] = await database(`select r.status,j.active from cron.job_run_details r join cron.job j on j.jobid=r.jobid
        where j.jobname='funnystudy-sms-delivery' and r.start_time >= ${sqlString(started.started_at)}::timestamptz
        order by r.runid desc limit 1;`, true);
      if (run?.status === "failed") throw new Error("The cron procedure failed its empty-queue check.");
      if (run?.status === "succeeded" && !run.active) { console.log(`${environment}: cron procedure succeeded and stopped on an empty queue. No SMS sent.`); return; }
    }
    throw new Error("Timed out waiting for the scheduler check.");
  } else {
    const [installed] = await database("select to_regclass('funnystudy_notifications.sms_config') is not null as installed;", true);
    const auth = await authConfig();
    console.log(JSON.stringify({ environment, auth: { phone_enabled: auth.external_phone_enabled,
      phone_autoconfirm: auth.sms_autoconfirm, sms_hook_enabled: auth.hook_send_sms_enabled,
      sms_hook_uri: auth.hook_send_sms_uri }, installed: installed.installed }, null, 2));
    if (installed.installed) {
      const [result] = await database(`select jsonb_build_object(
        'config',(select to_jsonb(c) from funnystudy_notifications.sms_config c),
        'secret_configured',exists(select 1 from vault.secrets where name='funnystudy_telnyx_api_key'),
        'sms_opt_ins',(select count(*) from public.profiles where notify_new_study_sms),
        'verified_phone_accounts',(select count(*) from auth.users where phone_confirmed_at is not null and nullif(phone,'') is not null),
        'eligible_now',(select count(*) from funnystudy_notifications.sms_recipients(now())),
        'deliveries',(select jsonb_object_agg(status,total) from (select status,count(*) total from funnystudy_notifications.sms_deliveries group by status) d),
        'jobs',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job where jobname like 'funnystudy-sms-%')
      ) as status;`);
      console.log(JSON.stringify(result.status, null, 2));
    }
  }
}
main().catch((error) => { console.error(safeMessage(error.message)); process.exitCode = 1; });
