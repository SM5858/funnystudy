// Fixed administrative operations for private daily phone reminders.
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const projects = {
  production: { ref: "kglxxmrvmrxiyigarjfh", site: "https://www.humorstudy.org" },
  staging: { ref: "qihsgnfjqmkjmoowyfbn", site: process.env.STUDY_VOICE_STAGING_SITE_URL },
};
const [operation, environment] = process.argv.slice(2);
const project = projects[environment];
const operations = ["provider-status", "provision", "status", "migrate", "update-notice", "check", "configure", "enable", "disable", "test-provider", "test-scheduler"];
if (!project || !operations.includes(operation)) {
  throw new Error(`Usage: study-voice.mjs ${operations.join("|")} production|staging`);
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
  if (!response.ok) throw new Error(safeMessage(`Administrative API request failed (HTTP ${response.status}, code ${data.errors?.[0]?.code || "unavailable"}): ${data.errors?.[0]?.title || data.message || "Request rejected"}`));
  return data;
}
const telnyx = (path, method, body) => api(`https://api.telnyx.com/v2/${path}`, process.env.TELNYX_API_KEY, method, body);
const database = (query, readOnly = false) => api(`https://api.supabase.com/v1/projects/${project.ref}/database/query`,
  process.env.SUPABASE_ACCESS_TOKEN, "POST", { query, read_only: readOnly });

async function validateSender(sender, connectionId) {
  if (!sender || !/^\+[1-9]\d{1,14}$/.test(sender) || !connectionId || !/^\d{1,30}$/.test(connectionId)) {
    throw new Error("A valid owned caller number and numeric TeXML application ID are required.");
  }
  const numbers = await telnyx(`phone_numbers?filter[phone_number]=${encodeURIComponent(sender)}&page[size]=100`);
  const number = numbers.data.find((record) => record.phone_number === sender && record.status === "active");
  if (!number || number.connection_id !== connectionId) throw new Error("The caller must be an owned, active number assigned to this TeXML application.");
  await telnyx(`phone_numbers/${number.id}/voice`);
  const application = (await telnyx(`texml_applications/${connectionId}`)).data;
  if (!application.active || !application.outbound?.outbound_voice_profile_id) throw new Error("The TeXML application must be active and have an outbound voice profile.");
  const profile = (await telnyx(`outbound_voice_profiles/${application.outbound.outbound_voice_profile_id}`)).data;
  if (!profile.enabled) throw new Error("The outbound voice profile is disabled.");
  return { application, profile };
}

async function main() {
  if (operation === "provider-status") {
    const results = await Promise.allSettled([
      telnyx("phone_numbers?page[size]=100"), telnyx("texml_applications?page[size]=100"),
      telnyx("outbound_voice_profiles?page[size]=100"),
    ]);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") { console.log(safeMessage(result.reason.message)); process.exitCode = 1; continue; }
      const records = result.value.data;
      if (i === 0) console.log(JSON.stringify({ numbers: records.map(({ id, phone_number, connection_id, status, features }) => ({ id, phone_number, connection_id, status, features })) }, null, 2));
      if (i === 1) console.log(JSON.stringify({ applications: records.map(({ id, friendly_name, active, outbound }) => ({ id, friendly_name, active, outbound })) }, null, 2));
      if (i === 2) console.log(JSON.stringify({ profiles: records.map(({ id, name, enabled, whitelisted_destinations }) => ({ id, name, enabled, whitelisted_destinations })) }, null, 2));
    }
  } else if (operation === "provision") {
    if (environment !== "production") throw new Error("Voice provisioning is scoped to production.");
    const sender = process.env.TELNYX_FROM_NUMBER;
    if (!sender || !/^\+[1-9]\d{1,14}$/.test(sender)) throw new Error("An owned TELNYX_FROM_NUMBER is required.");
    const numbers = await telnyx(`phone_numbers?filter[phone_number]=${encodeURIComponent(sender)}&page[size]=100`);
    const number = numbers.data.find((record) => record.phone_number === sender && record.status === "active");
    if (!number) throw new Error("The configured number must already be owned and active; no new number will be purchased.");
    await telnyx(`phone_numbers/${number.id}/voice`);
    const name = "Humor Study daily phone reminders";
    const profiles = await telnyx("outbound_voice_profiles?page[size]=100");
    let profile = profiles.data.find((record) => record.name === name);
    if (!profile) profile = (await telnyx("outbound_voice_profiles", "POST", {
      name, enabled: true, service_plan: "global", traffic_type: "conversational",
      usage_payment_method: "rate-deck", tags: ["funnystudy-production"],
    })).data;
    if (!profile.enabled) throw new Error("The dedicated outbound voice profile is disabled.");
    const applications = await telnyx("texml_applications?page[size]=100");
    let application = applications.data.find((record) => record.friendly_name === name);
    if (!application) application = (await telnyx("texml_applications", "POST", {
      friendly_name: name, voice_url: `${project.site}/api/telnyx/voice/fallback`,
      active: true, voice_method: "post", tags: ["funnystudy-production"],
      outbound: { outbound_voice_profile_id: profile.id },
    })).data;
    if (!application.active || application.outbound?.outbound_voice_profile_id !== profile.id) {
      throw new Error("The dedicated TeXML application must be active and assigned to its outbound voice profile.");
    }
    if (number.connection_id && number.connection_id !== application.id) {
      throw new Error("The number already has another voice connection; it will not be overwritten.");
    }
    if (number.connection_id !== application.id) {
      await telnyx(`phone_numbers/${number.id}`, "PATCH", { connection_id: application.id });
    }
    console.log(JSON.stringify({ sender, connection_id: application.id, outbound_voice_profile_id: profile.id,
      whitelisted_destinations: profile.whitelisted_destinations, number_reused: true }, null, 2));
  } else if (operation === "migrate" || operation === "update-notice") {
    const file = operation === "update-notice"
      ? "20261004043000_identify_study_phone_reminder_operator.sql"
      : "20261004031500_schedule_daily_study_phone_reminders.sql";
    const version = file.split("_")[0];
    const name = file.slice(version.length + 1, -4);
    if ((await database(`select version from supabase_migrations.schema_migrations where version=${sqlString(version)};`,true)).length) {
      console.log(`${environment}: voice migration already applied.`); return;
    }
    const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await database(`begin; ${sql}
      insert into supabase_migrations.schema_migrations(version,name,statements)
      values(${sqlString(version)},${sqlString(name)},array[${sqlString(sql)}]); commit;`);
    console.log(operation === "update-notice"
      ? `${environment}: reminder operator/contact notice updated; delivery configuration preserved.`
      : `${environment}: voice scheduling installed; delivery starts disabled.`);
  } else if (operation === "check") {
    await database(await readFile(new URL("../supabase/tests/daily_study_voice.sql",import.meta.url),"utf8"));
    console.log(`${environment}: daily voice database checks passed. HTTP mocked; all fixtures rolled back.`);
  } else if (operation === "configure") {
    const sender = process.env.TELNYX_FROM_NUMBER;
    const connectionId = process.env.TELNYX_VOICE_CONNECTION_ID;
    if (!project.site) throw new Error("The environment's site URL is required.");
    await validateSender(sender, connectionId);
    await database(`begin;
      do $$ declare secret_id uuid; begin
        select id into secret_id from vault.secrets where name='funnystudy_telnyx_api_key';
        if secret_id is null then perform vault.create_secret(${sqlString(process.env.TELNYX_API_KEY)},'funnystudy_telnyx_api_key');
        else perform vault.update_secret(secret_id,${sqlString(process.env.TELNYX_API_KEY)}); end if;
      end; $$;
      update funnystudy_notifications.voice_config set enabled=false,sender=${sqlString(sender)},
        connection_id=${sqlString(connectionId)},site_url=${sqlString(project.site)};
      select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-noon'),active:=false);
      commit;`);
    console.log(`${environment}: caller/application validated and Telnyx key saved in Vault; reminders remain disabled.`);
  } else if (operation === "enable") {
    const [config] = await database("select * from funnystudy_notifications.voice_config;",true);
    const { profile } = await validateSender(config.sender,config.connection_id);
    await database(`begin;
      do $$ begin
        if current_setting('cron.timezone',true) not in ('GMT','UTC')
          or not exists(select 1 from vault.decrypted_secrets where name='funnystudy_telnyx_api_key' and decrypted_secret<>'')
        then raise exception 'Phone reminders need a Vault credential and UTC/GMT cron timezone'; end if;
      end; $$;
      update funnystudy_notifications.voice_config set enabled=true;
      select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-noon'),active:=true);
      select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-delivery'),
        active:=exists(select 1 from funnystudy_notifications.voice_deliveries where status in('queued','sending')));
      commit;`);
    console.log(`${environment}: daily noon America/New_York phone reminders enabled. Outbound destinations: ${(profile.whitelisted_destinations || []).join(", ") || "provider defaults"}.`);
  } else if (operation === "disable") {
    await database(`begin; update funnystudy_notifications.voice_config set enabled=false;
      select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-noon'),active:=false);
      commit;`);
    console.log(`${environment}: phone reminders disabled; email, SMS, and verification configuration unchanged.`);
  } else if (operation === "test-provider") {
    // A required, empty destination cannot place a real call. This checks the
    // database/Vault/HTTP/API path without ringing any participant or contact.
    const [result] = await database(`select * from funnystudy_notifications.send_voice_request(
      (select connection_id from funnystudy_notifications.voice_config),
      jsonb_build_object('From',(select sender from funnystudy_notifications.voice_config),
        'To','','Texml','<Response><Hangup/></Response>'));`);
    if (![400,422].includes(result.status)) {
      let code = "unavailable", title = "Unexpected provider response";
      try { const error = JSON.parse(result.content).errors?.[0]; code = error?.code || code; title = error?.title || title; } catch {}
      throw new Error(safeMessage(`Voice API validation check failed (HTTP ${result.status}, code ${code}): ${title}`));
    }
    console.log(`${environment}: private database sender reached Telnyx using Vault; an empty destination was rejected (HTTP ${result.status}). No call was placed.`);
  } else if (operation === "test-scheduler") {
    const [started] = await database(`do $$ begin
      if exists(select 1 from funnystudy_notifications.voice_deliveries where status in('queued','sending'))
        then raise exception 'The scheduler check requires an empty pending queue'; end if;
      end; $$;
      select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-delivery'),active:=true);
      select clock_timestamp() as started_at;`);
    for (let attempt=0;attempt<30;attempt++) {
      await setTimeout(1000);
      const [run] = await database(`select r.status,j.active from cron.job_run_details r join cron.job j on j.jobid=r.jobid
        where j.jobname='funnystudy-voice-delivery' and r.start_time>=${sqlString(started.started_at)}::timestamptz
        order by r.runid desc limit 1;`,true);
      if (run?.status === "failed") throw new Error("The voice cron procedure failed its empty-queue check.");
      if (run?.status === "succeeded" && !run.active) {
        console.log(`${environment}: cron procedure succeeded and stopped on an empty queue. No call placed.`); return;
      }
    }
    throw new Error("Timed out waiting for the voice scheduler check.");
  } else if (operation === "status") {
    const [schema] = await database(`select jsonb_build_object(
      'installed',to_regclass('funnystudy_notifications.voice_config') is not null,
      'phone_call_opt_ins',(select count(*) from public.profiles where notify_new_study_phone_call is true),
      'verified_phone_accounts',(select count(*) from auth.users where phone_confirmed_at is not null and nullif(phone,'') is not null),
      'preference_columns',(select jsonb_agg(jsonb_build_object('name',column_name,'nullable',is_nullable,'default',column_default))
        from information_schema.columns where table_schema='public' and table_name='profiles' and column_name like 'notify_new_study_%')
    ) as status;`, true);
    console.log(JSON.stringify({ environment, ...schema.status }, null, 2));
    if (schema.status.installed) {
      const [result] = await database(`select jsonb_build_object(
        'config',(select to_jsonb(c) from funnystudy_notifications.voice_config c),
        'secret_configured',exists(select 1 from vault.secrets where name='funnystudy_telnyx_api_key'),
        'eligible_now',(select count(*) from funnystudy_notifications.voice_recipients(now())),
        'deliveries',(select jsonb_object_agg(status,total) from (select status,count(*) total from funnystudy_notifications.voice_deliveries group by status) d),
        'jobs',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job where jobname like 'funnystudy-voice-%')
      ) as status;`);
      console.log(JSON.stringify(result.status, null, 2));
    }
  }
}
main().catch((error) => { console.error(safeMessage(error.message)); process.exitCode = 1; });
