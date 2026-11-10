// Fixed administrative operations for the nullable preference rollout.
// No arbitrary SQL, delivery, or application admin credentials are exposed.
import { readFile } from "node:fs/promises";

const projects = { production: "kglxxmrvmrxiyigarjfh", staging: "qihsgnfjqmkjmoowyfbn" };
const [operation, environment, testEmail] = process.argv.slice(2);
if (!projects[environment] || !["status", "migrate", "check", "reset-test-user"].includes(operation)) {
  throw new Error("Usage: notification-preferences.mjs status|migrate|check|reset-test-user production|staging [test-account-email]");
}
if (operation === "reset-test-user" && (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail))) {
  throw new Error("An explicit test-account email is required for the preference reset.");
}
const file = "20261004022000_allow_unanswered_notification_preferences.sql";
const version = file.split("_")[0];
const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
async function database(query, readOnly = false) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required for administrative setup.");
  const response = await fetch(`https://api.supabase.com/v1/projects/${projects[environment]}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: readOnly }), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${(data.message || "Database operation failed").replaceAll(token, "[redacted]")}`);
  return data;
}
async function main() {
  if (operation === "migrate") {
    const applied = await database(`select version from supabase_migrations.schema_migrations where version=${sqlString(version)}`, true);
    if (applied.length) { console.log(`${environment}: preference migration already applied.`); return; }
    const migration = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await database(`begin; ${migration}
      insert into supabase_migrations.schema_migrations(version,name,statements)
      values(${sqlString(version)},'allow_unanswered_notification_preferences',array[${sqlString(migration)}]); commit;`);
    console.log(`${environment}: preferences now nullable with NULL defaults; existing choices preserved.`);
  } else if (operation === "check") {
    await database(await readFile(new URL("../supabase/tests/study_notification_preferences.sql", import.meta.url), "utf8"));
    console.log(`${environment}: nullable defaults, independent choices, and participant permissions passed; fixtures rolled back.`);
  } else if (operation === "reset-test-user") {
    await database(`begin;
      do $$ declare matched integer; changed integer; begin
        select count(*) into matched from auth.users u join public.profiles p on p.id=u.id
          where lower(u.email)=${sqlString(testEmail.toLowerCase())};
        if matched<>1 then raise exception 'Expected exactly one test account and profile'; end if;
        update public.profiles p set notify_new_study_email=null, notify_new_study_sms=null, notify_new_study_phone_call=null
          from auth.users u where p.id=u.id and lower(u.email)=${sqlString(testEmail.toLowerCase())};
        get diagnostics changed=row_count;
        if changed<>1 then raise exception 'Test account preference reset did not update one row'; end if;
      end; $$; commit;`);
    console.log(`${environment}: all three preferences reset to NULL for the requested test account.`);
  } else {
    const columns = await database(`select column_name,is_nullable,column_default from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name in
      ('notify_new_study_email','notify_new_study_sms','notify_new_study_phone_call') order by column_name`, true);
    const account = testEmail ? await database(`select count(*) as matching_accounts,
      bool_and(p.notify_new_study_email is null and p.notify_new_study_sms is null and p.notify_new_study_phone_call is null) as all_unanswered
      from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=${sqlString(testEmail.toLowerCase())}`, true) : [];
    console.log(JSON.stringify({ environment, columns, testAccount: account[0] }, null, 2));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
