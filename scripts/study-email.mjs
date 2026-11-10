// Narrow administrative entry point for this repository's study email job.
// Runtime delivery uses database cron and Vault, never an application admin key.
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const projects = {
  production: { ref: "kglxxmrvmrxiyigarjfh", site: "https://www.humorstudy.org" },
  staging: { ref: "qihsgnfjqmkjmoowyfbn", site: process.env.STUDY_EMAIL_STAGING_SITE_URL },
};
const [operation, environment] = process.argv.slice(2);
const project = projects[environment];
if (!project || !["status", "migrate", "check", "configure", "enable", "disable", "test-provider", "test-scheduler"].includes(operation)) {
  throw new Error("Usage: study-email.mjs status|migrate|check|configure|enable|disable|test-provider|test-scheduler production|staging");
}

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
function safeMessage(message) {
  for (const secret of [process.env.RESEND_API_KEY, process.env.SUPABASE_ACCESS_TOKEN]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message;
}

async function database(query, readOnly = false) {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN is required for administrative setup.");
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: readOnly }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(safeMessage(`Supabase HTTP ${response.status}: ${data.message || "Database operation failed"}`));
  return data;
}

async function resend(path) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required.");
  const response = await fetch(`https://api.resend.com/${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(safeMessage(`Resend HTTP ${response.status}: ${data.message || "Provider operation failed"}`));
  return data;
}

async function main() {
  if (operation === "migrate") {
    for (const file of [
      "20261003231955_add_study_notification_preferences.sql",
      "20261004000300_schedule_daily_study_email_reminders.sql",
      "20261004000708_send_study_emails_without_public_http_queue.sql",
      "20261004001300_support_installed_http_header_types.sql",
    ]) {
      const version = file.split("_")[0];
      const name = file.slice(version.length + 1, -4);
      const recorded = await database(`select version from supabase_migrations.schema_migrations where version = ${sqlString(version)};`, true);
      if (recorded.length) { console.log(`${environment}: ${version} already applied.`); continue; }
      const migration = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
      await database(`begin;\n${migration}\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${sqlString(version)}, ${sqlString(name)}, array[${sqlString(migration)}]);\ncommit;`);
      console.log(`${environment}: applied ${file}. Email delivery remains disabled until configured.`);
    }
  } else if (operation === "check") {
    for (const file of ["study_notification_preferences.sql", "daily_study_emails.sql"]) {
      const sql = await readFile(new URL(`../supabase/tests/${file}`, import.meta.url), "utf8");
      await database(sql);
    }
    console.log(`${environment}: preference permissions and daily study email database checks passed. All fixtures rolled back; no emails sent.`);
  } else if (operation === "configure") {
    if (!project.site) throw new Error("STUDY_EMAIL_STAGING_SITE_URL is required for staging configuration.");
    const sender = process.env.RESEND_FROM || "Humor Study <notifications@thehumorproject.org>";
    const senderAddress = sender.match(/<([^<>\s]+)>$/)?.[1] || sender;
    const senderDomain = senderAddress.split("@")[1];
    const domains = await resend("domains");
    if (!domains.data.some((domain) => domain.name === senderDomain && domain.status === "verified" && domain.capabilities?.sending === "enabled")) {
      throw new Error("The configured sender must use a verified Resend sending domain.");
    }
    await database(`begin;
      do $setup$ declare secret_id uuid; begin
        select id into secret_id from vault.secrets where name = 'funnystudy_resend_api_key';
        if secret_id is null then
          perform vault.create_secret(${sqlString(process.env.RESEND_API_KEY)}, 'funnystudy_resend_api_key', 'Humor Study daily reminder sender');
        else
          perform vault.update_secret(secret_id, ${sqlString(process.env.RESEND_API_KEY)});
        end if;
      end; $setup$;
      update funnystudy_notifications.email_config set enabled = false, sender = ${sqlString(sender)}, site_url = ${sqlString(project.site)};
      select funnystudy_notifications.set_delivery_job_active(false);
      commit;`);
    console.log(`${environment}: verified sender ${sender}; saved the Resend key in Vault. Delivery is disabled.`);
  } else if (operation === "enable") {
    await database(`begin;
      do $$ begin
        if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261004001300') then
          raise exception 'Install the private direct HTTP transport before enabling reminders';
        end if;
        if not exists (select 1 from vault.decrypted_secrets where name = 'funnystudy_resend_api_key' and decrypted_secret <> '') then
          raise exception 'Configure the Resend secret before enabling reminders';
        end if;
        if current_setting('cron.timezone', true) not in ('GMT', 'UTC') then
          raise exception 'The noon schedule requires cron.timezone = GMT or UTC';
        end if;
      end; $$;
      update funnystudy_notifications.email_config set enabled = true;
      select funnystudy_notifications.set_delivery_job_active(exists (
        select 1 from funnystudy_notifications.email_deliveries where status in ('queued', 'retry', 'sending')
      ));
      commit;`);
    console.log(`${environment}: daily noon America/New_York reminders enabled. Any existing daily queue resumes; new reminders queue at noon.`);
  } else if (operation === "disable") {
    await database(`begin; update funnystudy_notifications.email_config set enabled = false;
      select funnystudy_notifications.set_delivery_job_active(false); commit;`);
    console.log(`${environment}: daily email reminders disabled.`);
  } else if (operation === "test-scheduler") {
    const started = await database(`begin;
      do $$ begin
        if exists (select 1 from funnystudy_notifications.email_config where enabled)
          or exists (select 1 from funnystudy_notifications.email_deliveries where status in ('queued', 'sending', 'retry')) then
          raise exception 'The scheduler check requires disabled sending and an empty pending queue';
        end if;
      end; $$;
      select funnystudy_notifications.set_delivery_job_active(true);
      commit;
      select clock_timestamp() as started_at;`);
    for (let attempt = 0; attempt < 30; attempt++) {
      await setTimeout(1000);
      const runs = await database(`select r.status, j.active from cron.job_run_details r
        join cron.job j on j.jobid = r.jobid
        where j.jobname = 'funnystudy-email-delivery'
          and r.start_time >= ${sqlString(started[0].started_at)}::timestamptz
        order by r.runid desc limit 1;`, true);
      if (runs[0]?.status === "failed") throw new Error("The production cron worker's empty-queue check failed.");
      if (runs[0]?.status === "succeeded" && !runs[0].active) {
        console.log(`${environment}: cron executed the empty delivery worker successfully and it deactivated itself. No email request was queued.`);
        return;
      }
    }
    throw new Error("Timed out waiting for the scheduler's empty-queue check.");
  } else if (operation === "test-provider") {
    const key = `funnystudy-provider-check/${project.ref}/${new Date().toISOString().slice(0, 10)}`;
    const responses = await database(`select * from funnystudy_notifications.send_email_request(
      jsonb_build_object(
        'from', (select sender from funnystudy_notifications.email_config),
        'to', jsonb_build_array('delivered@resend.dev'),
        'subject', 'Humor Study reminder integration check',
        'text', 'The daily study reminder sender is configured. This message uses Resend''s test recipient and is not sent to a participant.'
      ),
      (select decrypted_secret from vault.decrypted_secrets where name = 'funnystudy_resend_api_key'),
      ${sqlString(key)}
    );`);
    const response = responses[0];
    if (response.status < 200 || response.status >= 300 || response.status === null) {
      throw new Error(`Database HTTP sender's test request failed (HTTP ${response.status ?? "unavailable"}).`);
    }
    const result = JSON.parse(response.content);
    if (!result.id) throw new Error("Resend did not return a provider ID for the test email.");
    console.log(`${environment}: the direct database sender used its Vault key and Resend accepted the test-sink email (${result.id}). No participant was contacted.`);
  } else {
    const schema = await database("select exists (select 1 from pg_namespace where nspname = 'funnystudy_notifications') as installed;", true);
    if (!schema[0].installed) { console.log(`${environment}: daily email migration is not installed.`); return; }
    const data = await database(`select jsonb_build_object(
      'config', (select to_jsonb(c) from funnystudy_notifications.email_config c),
      'secret_configured', exists(select 1 from vault.secrets where name = 'funnystudy_resend_api_key'),
      'email_opt_ins', (select count(*) from public.profiles where notify_new_study_email),
      'eligible_now', (select count(*) from funnystudy_notifications.email_recipients(now())),
      'deliveries', (select jsonb_object_agg(status, total) from (select status,count(*) as total from funnystudy_notifications.email_deliveries group by status) d),
      'cron_jobs', (select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job where jobname like 'funnystudy-email-%')
    ) as status;`);
    console.log(JSON.stringify({ environment, project: project.ref, ...data[0].status }, null, 2));
  }
}

main().catch((error) => { console.error(safeMessage(error.message)); process.exitCode = 1; });
