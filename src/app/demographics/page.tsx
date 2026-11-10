import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signOut } from "@/app/profile-actions";
import { AccountMenu } from "@/components/AccountMenu";
import { DemographicQuestionCard } from "@/components/DemographicQuestionCard";
import { fetchDemographicSurveyState } from "@/lib/demographics";
import { DEMOGRAPHIC_SKIPS_COOKIE, readDemographicSkips } from "@/lib/demographic-skips";
import { createClient } from "@/lib/supabase/server";
import { normalizeRelativePath } from "@/lib/url";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Profile = {
  first_name: string | null;
  last_name: string | null;
};

export default async function DemographicsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const next = normalizeRelativePath(resolvedParams.next);
  const skippedParams = Array.isArray(resolvedParams.skipped)
    ? resolvedParams.skipped
    : resolvedParams.skipped
      ? [resolvedParams.skipped]
      : [];
  const message = Array.isArray(resolvedParams.message)
    ? resolvedParams.message[0]
    : resolvedParams.message;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const skipped = [
    ...new Set([
      ...skippedParams,
      ...readDemographicSkips(
        (await cookies()).get(DEMOGRAPHIC_SKIPS_COOKIE)?.value,
        user.id
      ),
    ]),
  ];

  const [{ data: profileData }, surveyState] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single(),
    fetchDemographicSurveyState(supabase, user.id, skipped),
  ]);

  const profile = profileData as Profile | null;
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = fullName || user.email || "your account";

  if (surveyState.error) {
    return (
      <DemographicsShell displayName={displayName} email={user.email}>
        <div className="rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-6 text-center sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--soft)]">
            Participant Demographic Survey
          </p>
          <h1 className="mt-3 text-2xl font-bold text-[var(--error-text)]">
            We could not load the survey.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
            You can continue to the study list while we sort that out.
          </p>
          <a
            href={next}
            className="mt-6 inline-flex rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-contrast)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
          >
            Continue
          </a>
        </div>
      </DemographicsShell>
    );
  }

  const currentQuestion = surveyState.pendingQuestions[0];

  if (!currentQuestion) {
    redirect(next);
  }

  return (
    <DemographicsShell displayName={displayName} email={user.email}>
      <DemographicQuestionCard
        message={message}
        next={next}
        profileId={user.id}
        questions={surveyState.pendingQuestions}
        skipped={skipped}
      />
    </DemographicsShell>
  );
}

function DemographicsShell({
  children,
  displayName,
  email,
}: {
  children: React.ReactNode;
  displayName: string;
  email?: string | null;
}) {
  return (
    <div
      id="demographics-root"
      className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 py-4 text-[var(--foreground)] sm:px-6 sm:py-6"
    >
      <main className="mx-auto flex w-full max-w-4xl flex-1 min-h-0 items-center justify-center">
        {children}
      </main>
      <AccountMenu
        displayName={displayName}
        email={email}
        signOutAction={signOut}
      />
    </div>
  );
}
