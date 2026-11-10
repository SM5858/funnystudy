import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOut } from "@/app/profile-actions";
import { AccountMenu } from "@/components/AccountMenu";
import { type CaptionForVote } from "@/components/CaptionVoteFlow";
import { CaptionVoteSection } from "@/components/CaptionVoteSection";
import { CompleteProfileForm } from "@/components/CompleteProfileForm";
import { PrivateStudyDisclaimer } from "@/components/PrivateStudyDisclaimer";
import { StudyEasterEgg } from "@/components/StudyEasterEgg";
import { resolveStudyCaptionImageUrl } from "@/lib/caption-images";
import {
  fetchInitialActiveStudyCaptions,
  resolveNumericStudy,
} from "@/lib/studies";
import { createClient } from "@/lib/supabase/server";
import { fetchStudyParticipations, isStudyCompleted } from "@/lib/study-participation";

type PageParams = Promise<{
  studyId: string;
}>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Profile = {
  first_name: string | null;
  is_superadmin: boolean;
  last_name: string | null;
};

function parseStudyId(value: string) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const studyId = Number(value);

  return Number.isSafeInteger(studyId) && studyId > 0 ? studyId : null;
}

export default async function NumericStudyPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: SearchParams;
}) {
  const { studyId: studyIdParam } = await params;
  const studyId = parseStudyId(studyIdParam);

  if (studyId === null) {
    notFound();
  }

  const resolvedParams = (await searchParams) ?? {};
  const messageRaw = resolvedParams.message;
  const message = Array.isArray(messageRaw) ? messageRaw[0] : messageRaw;

  const supabase = await createClient();
  const studyNow = new Date();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const studyResult = await resolveNumericStudy(supabase, studyId, studyNow);

  if (studyResult.status === "error") {
    console.error("[NumericStudyPage] load study failed", studyResult.error);
    throw new Error("Could not load study");
  }

  if (studyResult.status === "missing") {
    notFound();
  }

  const { participations, error: participationError } = await fetchStudyParticipations(
    supabase, user.id, [studyResult.study.id]
  );
  const participation = participations[0] ?? null;
  if (participationError) {
    console.error("[NumericStudyPage] load participation failed", participationError);
  }

  if (studyResult.status === "expired" && !isStudyCompleted(participation) && !participationError) {
    return <ExpiredStudyPage isPrivate={studyResult.study.is_private === true} />;
  }

  const currentPath = `/study/${studyResult.study.id}`;
  const { data: profileData } = await supabase
    .from("profiles")
    .select("first_name, last_name, is_superadmin")
    .eq("id", user.id)
    .single();
  const profile = profileData as Profile | null;

  if (!profile?.first_name || !profile?.last_name) {
    return (
      <CompleteProfileForm
        initialFirst={profile?.first_name ?? ""}
        initialLast={profile?.last_name ?? ""}
        message={message}
        nextPath={currentPath}
        userEmail={user.email}
      />
    );
  }

  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = fullName || user.email || "your account";
  const skipCaptions = Boolean(participationError) || isStudyCompleted(participation);
  const {
    captionOrder,
    captions: initialCaptions,
    error: activeStudyError,
    nextOffset,
  } = skipCaptions
    ? { captionOrder: [], captions: [], error: null, nextOffset: null }
    : await fetchInitialActiveStudyCaptions(supabase, user.id, {
        includePrivateStudies: true,
        now: studyNow,
        studyId: studyResult.study.id,
      });

  const captionsForVote: CaptionForVote[] = initialCaptions.map((caption) => ({
    id: caption.id,
    isLiked: caption.is_liked,
    isSaved: caption.is_saved,
    content: caption.content,
    imageSrc: resolveStudyCaptionImageUrl(caption),
    studyCaptionMappingId: caption.study_caption_mapping_id,
  }));

  const slug = studyResult.study.slug?.trim() || "no slug";

  return (
    <div
      id="numeric-study-root"
      className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 py-3 text-[var(--foreground)] sm:px-6 sm:py-4"
    >
      {studyResult.study.is_private === true ? (
        <PrivateStudyDisclaimer key={`${user.id}:${studyResult.study.id}`} />
      ) : null}
      <StudyNavigation />
      <div
        id="numeric-study-content"
        className="relative mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col items-stretch"
      >
        <CaptionVoteSection
          key={`${user.id}:${studyResult.study.id}`}
          captionOrder={captionOrder}
          captions={captionsForVote}
          includePrivateStudies
          initialNextOffset={nextOffset}
          initialTotalCaptionCount={captionOrder.length}
          loadError={!!activeStudyError}
          initialParticipation={participation}
          participationLoadError={!!participationError}
          reservedTopPx={56}
          studyId={studyResult.study.id}
        />
      </div>
      <AccountMenu
        displayName={displayName}
        email={user.email}
        signOutAction={signOut}
      />
      {profile.is_superadmin ? (
        <StudyEasterEgg revealText={`study ${studyResult.study.id} | ${slug}`} />
      ) : null}
    </div>
  );
}

function StudyNavigation() {
  return (
    <nav aria-label="Study navigation" className="flex shrink-0">
      <Link
        href="/"
        aria-label="Back to studies"
        title="Back to studies"
        className="flex h-14 w-14 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
      >
        <ArrowLeftIcon aria-hidden className="h-9 w-9" />
      </Link>
    </nav>
  );
}

function ExpiredStudyPage({ isPrivate }: { isPrivate: boolean }) {
  return (
    <main className="flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 py-3 text-[var(--foreground)] sm:px-6 sm:py-4">
      {isPrivate ? <PrivateStudyDisclaimer /> : null}
      <StudyNavigation />
      <div className="flex min-h-0 flex-1 items-center justify-center text-center">
        <p className="text-sm">sorry, this study is expired!</p>
      </div>
    </main>
  );
}
