import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Regression cover for resuming a study: the real libraries, server pages and
// server actions run against controlled auth and data, so none of this needs a
// live database.
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
    (name) => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    loadedModule,
    loadedModule.exports
  );
  return loadedModule.exports;
}

const captionOrderModule = loadModule("src/lib/study-caption-order.ts");
const statsModule = loadModule("src/lib/study-stats.ts");
const participationModule = loadModule("src/lib/study-participation.ts");
const studiesModule = loadModule("src/lib/studies.ts", {
  "@/lib/study-caption-order": captionOrderModule,
});
const progressModule = loadModule("src/lib/study-progress.ts", {
  "@/lib/studies": studiesModule,
});

const profileId = "participant-a";
const otherProfileId = "participant-b";
const STUDY_ID = 1;
const OTHER_STUDY_ID = 2;
const NullComponent = () => null;

function captionId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

class Redirect extends Error {
  constructor(path) {
    super(path);
    this.path = path;
  }
}

/**
 * One study of `captionCount` captions, plus whatever this participant has
 * already recorded against it. `navigated` and `liked` are 1-based caption
 * numbers; `navigated` stands for captions the participant advanced past.
 */
function createStudyScenario({
  captionCount = 13,
  navigated = [],
  liked = [],
  navigationSessions = {},
  voteSessions = {},
  navigationTimesMs = {},
  voteTimesMs = {},
  participation = {
    profile_id: profileId,
    study_id: STUDY_ID,
    started_at: "2026-11-01T12:00:00Z",
    ended_at: null,
    completion_stats: null,
  },
  foreignEvents = [],
  failTable = null,
} = {}) {
  const studyRow = (id) => ({
    id,
    slug: `study-${id}`,
    description: null,
    is_private: false,
    start_datetime_utc: null,
    end_datetime_utc: null,
  });
  const mappings = Array.from({ length: captionCount }, (_, index) => ({
    id: index + 1,
    study_id: STUDY_ID,
    caption_id: captionId(index + 1),
    start_datetime_utc: null,
    end_datetime_utc: null,
    studies: studyRow(STUDY_ID),
    captions: {
      id: captionId(index + 1),
      content: `Caption ${index + 1}`,
      created_datetime_utc: null,
      image_id: null,
      like_count: 0,
      images: null,
    },
  }));
  const navigationEvents = navigated.map((index) => ({
    profile_id: profileId,
    caption_id: captionId(index),
    study_caption_mapping_id: index,
    session_id: navigationSessions[index] ?? "session-1",
    time_to_next_caption_ms: navigationTimesMs[index] ?? 2000,
  }));
  const voteEvents = liked.map((index) => ({
    profile_id: profileId,
    caption_id: captionId(index),
    study_caption_mapping_id: index,
    session_id: voteSessions[index] ?? "session-1",
    time_to_vote_ms: voteTimesMs[index] ?? 1200,
  }));
  const rows = {
    studies: [studyRow(STUDY_ID), studyRow(OTHER_STUDY_ID)],
    study_caption_mappings: mappings,
    study_caption_navigation_events: [
      ...navigationEvents,
      ...foreignEvents.filter((event) => event.table === "navigation").map((event) => ({
        profile_id: event.profileId ?? otherProfileId,
        caption_id: captionId(event.caption),
        study_caption_mapping_id: event.mappingId ?? null,
        session_id: "session-foreign",
        time_to_next_caption_ms: 9999,
      })),
    ],
    study_caption_vote_events: voteEvents,
    caption_votes: liked.map((index) => ({
      profile_id: profileId,
      caption_id: captionId(index),
      is_from_study: true,
      vote_value: 1,
    })),
    caption_saves: [],
    study_participations: participation ? [participation] : [],
    profiles: [
      { id: profileId, first_name: "Test", last_name: "Participant", is_superadmin: false },
    ],
    demographic_questions: [],
    demographic_answers: [],
    demographic_answer_question_mapping: [],
    demographic_user_responses: [],
  };

  const valueAt = (row, key) => key.split(".").reduce((value, part) => value?.[part], row);
  const rpcCalls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: profileId } } }),
    },
    rpc: (name, args) => {
      rpcCalls.push({ name, args });
      return {
        single: async () => ({
          data: { ...participation, ended_at: "2026-11-02T12:00:00Z", completion_stats: args.p_completion_stats },
          error: null,
        }),
      };
    },
    from(table) {
      const filters = [];
      const order = [];
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      const result = () => {
        if (failTable === table) {
          return { data: null, error: { message: `Unavailable table ${table}` } };
        }
        const data = (rows[table] ?? [])
          .filter((row) => filters.every((filter) => filter(row)))
          .sort((left, right) => {
            for (const key of order) {
              if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
            }
            return 0;
          })
          .slice(from, to + 1);
        return { data, error: null };
      };
      const query = {
        select(selection = "") {
          if (selection.includes("captions!inner")) {
            filters.push((row) => Boolean(row.captions));
          }
          return query;
        },
        eq(key, value) { filters.push((row) => valueAt(row, key) === value); return query; },
        gt(key, value) { filters.push((row) => valueAt(row, key) > value); return query; },
        is(key, value) { filters.push((row) => (valueAt(row, key) ?? null) === value); return query; },
        in(key, values) { filters.push((row) => values.includes(valueAt(row, key))); return query; },
        or(expression, options = {}) {
          const alternatives = expression.split(",").map((condition) => {
            const [, key, operator, value] = condition.match(/^([^.]+)\.(lte|gte|is)\.(.+)$/);
            return (row) => {
              const actual = options.referencedTable ? row[options.referencedTable]?.[key] : row[key];
              if (operator === "is") return (actual ?? null) === null;
              return actual !== null && actual !== undefined &&
                (operator === "lte" ? actual <= value : actual >= value);
            };
          });
          filters.push((row) => alternatives.some((filter) => filter(row)));
          return query;
        },
        order(key) { order.push(key); return query; },
        range(rangeFrom, rangeTo) { from = rangeFrom; to = rangeTo; return query; },
        single: async () => { const page = result(); return { ...page, data: page.data?.[0] ?? null }; },
        maybeSingle: async () => { const page = result(); return { ...page, data: page.data?.[0] ?? null }; },
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };

  const imports = {
    "next/headers": { cookies: async () => ({ get: () => undefined, delete: () => {} }) },
    "next/navigation": {
      redirect: (path) => { throw new Redirect(path); },
      notFound: () => { throw new Redirect("/404"); },
    },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/studies": studiesModule,
    "@/lib/study-progress": progressModule,
    "@/lib/study-participation": participationModule,
    "@/lib/study-stats": statsModule,
    "@/lib/study-caption-order": captionOrderModule,
    "@/lib/caption-images": { resolveStudyCaptionImageUrl: () => null },
    "@/app/profile-actions": { signOut: async () => {} },
    "@/components/AccountMenu": { AccountMenu: NullComponent },
    "@/components/CompleteProfileForm": { CompleteProfileForm: NullComponent },
    "@/components/StudyEasterEgg": { StudyEasterEgg: NullComponent },
    "@/components/PrivateStudyDisclaimer": { PrivateStudyDisclaimer: NullComponent },
    "@/components/theme/ThemeMenu": { ThemeMenu: NullComponent },
    "@/components/SubmitButton": loadModule("src/components/SubmitButton.tsx"),
    "@/components/LocalDateTime": loadModule("src/components/LocalDateTime.tsx"),
    "@/lib/demographics": { hasPendingDemographicQuestions: async () => false, buildDemographicsPath: () => "/demographics" },
    "@/lib/notification-preferences": {
      fetchNotificationPreferences: async () => ({ pending: [] }),
      buildNotificationPreferencesPath: () => "/notification-preferences",
      NOTIFICATION_SKIPS_COOKIE: "notification_skips",
      readNotificationSkips: () => [],
    },
    "@/lib/demographic-skips": { DEMOGRAPHIC_SKIPS_COOKIE: "demographic_skips", readDemographicSkips: () => [] },
  };
  // The vote flow itself is a browser component. The section around it stays
  // real, and the props it hands the flow are what these tests read.
  const flowModule = {
    CaptionVoteFlow: (props) => {
      flowModule.lastProps = props;
      return null;
    },
    lastProps: null,
  };
  imports["@/components/CaptionVoteSection"] = loadModule("src/components/CaptionVoteSection.tsx", {
    "./CaptionVoteFlow": flowModule,
    "@/lib/study-participation": participationModule,
    "@/components/CompletedStudy": loadModule("src/components/CompletedStudy.tsx", {
      "@/lib/study-stats": statsModule,
    }),
  });

  return {
    client,
    mappings,
    rows,
    rpcCalls,
    flowProps() { return flowModule.lastProps; },
    progress() {
      return progressModule.fetchStudyProgress(client, profileId, {
        includePrivateStudies: true,
        studyId: STUDY_ID,
      });
    },
    initial(excludeCaptionIds) {
      return studiesModule.fetchInitialActiveStudyCaptions(client, profileId, {
        excludeCaptionIds,
        includePrivateStudies: true,
        studyId: STUDY_ID,
      });
    },
    home: () => loadModule("src/app/page.tsx", imports).default({}),
    study: () =>
      loadModule("src/app/study/[studyId]/page.tsx", imports).default({
        params: Promise.resolve({ studyId: String(STUDY_ID) }),
      }),
    endStudy: (stats) =>
      loadModule("src/app/study/actions.ts", imports).endStudy(STUDY_ID, stats),
  };
}

test("a participant who saw six of thirteen captions resumes with the other seven", async () => {
  const scenario = createStudyScenario({ navigated: [1, 2, 3, 4, 5], liked: [6] });
  const { error, progress, seenCaptionIds } = await scenario.progress();

  assert.equal(error, null);
  assert.deepEqual(progress, {
    remainingCount: 7,
    seenCount: 6,
    sessionCount: 1,
    totalCount: 13,
  });

  const run = await scenario.initial(seenCaptionIds);
  assert.equal(run.error, null);
  assert.equal(run.totalCaptionCount, 13);
  assert.equal(run.excludedCaptionCount, 6);
  assert.equal(run.captionOrder.length, 7);
  assert.deepEqual(
    [...run.captionOrder].sort(),
    [7, 8, 9, 10, 11, 12, 13].map(captionId)
  );
  assert.equal(
    run.captions.some((caption) => caption.id === captionId(6)),
    false,
    "a liked caption is never dealt again, even without a navigation event"
  );
});

test("the counter opens at the participant's real position instead of 1", () => {
  const resumed = captionOrderModule.captionProgressPosition({
    currentIndex: 0,
    queueLength: 7,
    seenBeforeThisRun: 6,
    totalCaptionCount: 13,
  });
  assert.deepEqual(resumed, { position: 7, total: 13 });
  assert.equal(captionOrderModule.formatCaptionProgressLabel(resumed), "7/13");

  // The same values a first render has, so there is no 1-of-13 flash to fix.
  assert.deepEqual(
    captionOrderModule.captionProgressPosition({
      currentIndex: 3,
      queueLength: 7,
      seenBeforeThisRun: 6,
      totalCaptionCount: 13,
    }),
    { position: 10, total: 13 }
  );
  assert.deepEqual(
    captionOrderModule.captionProgressPosition({
      currentIndex: 0,
      queueLength: 13,
      seenBeforeThisRun: 0,
      totalCaptionCount: 13,
    }),
    { position: 1, total: 13 },
    "a first sitting still starts at 1"
  );
  assert.deepEqual(
    captionOrderModule.captionProgressPosition({
      currentIndex: 2,
      queueLength: 3,
      seenBeforeThisRun: 0,
      totalCaptionCount: 0,
    }),
    { position: 3, total: 3 },
    "an unknown total falls back to what the queue holds"
  );
});

test("another participant's and another study's events do not count as progress", async () => {
  const scenario = createStudyScenario({
    captionCount: 4,
    navigated: [1],
    foreignEvents: [
      { table: "navigation", profileId: otherProfileId, caption: 2, mappingId: 2 },
    ],
  });
  scenario.rows.study_caption_navigation_events.push({
    profile_id: profileId,
    caption_id: captionId(99),
    study_caption_mapping_id: 99,
    session_id: "session-other-study",
    time_to_next_caption_ms: 1000,
  });

  const { progress, seenCaptionIds } = await scenario.progress();
  assert.equal(progress.seenCount, 1);
  assert.equal(progress.remainingCount, 3);
  assert.deepEqual([...seenCaptionIds], [captionId(1)]);
});

test("the saved stats cover every sitting, not only the last one", async () => {
  const scenario = createStudyScenario({
    navigated: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    liked: [1, 2, 7, 8, 9],
    navigationSessions: { 7: "session-2", 8: "session-2", 9: "session-2", 10: "session-2", 11: "session-2", 12: "session-2", 13: "session-2" },
    voteSessions: { 7: "session-2", 8: "session-2", 9: "session-2" },
    voteTimesMs: { 1: 1000, 2: 1000, 7: 2000, 8: 3000, 9: 3000 },
  });

  // What the browser knows is only the second sitting: 7 captions, 3 likes.
  const result = await scenario.endStudy({
    likedCount: 3,
    viewedCount: 7,
    medianVoteTimeMs: 3000,
    medianNavigationTimeMs: 2000,
  });

  assert.equal(result.success, true);
  const saved = scenario.rpcCalls.at(-1);
  assert.equal(saved.name, "end_study");
  assert.deepEqual(saved.args.p_completion_stats, {
    likedCount: 5,
    viewedCount: 13,
    medianVoteTimeMs: 2000,
    medianNavigationTimeMs: 2000,
    sessionCount: 2,
  });
});

test("the last caption's in-flight telemetry cannot shrink the saved stats", async () => {
  const scenario = createStudyScenario({
    captionCount: 3,
    navigated: [1, 2],
    liked: [1],
  });

  await scenario.endStudy({
    likedCount: 1,
    viewedCount: 3,
    medianVoteTimeMs: 1200,
    medianNavigationTimeMs: 2000,
  });

  const saved = scenario.rpcCalls.at(-1).args.p_completion_stats;
  assert.equal(saved.viewedCount, 3, "the sitting's own count is a floor");
  assert.equal(saved.likedCount, 1);
  assert.ok(saved.likedCount <= saved.viewedCount);
});

test("a study with every caption seen offers End Study instead of a dead end", async () => {
  const scenario = createStudyScenario({
    captionCount: 3,
    navigated: [1, 2, 3],
  });
  const { progress, seenCaptionIds } = await scenario.progress();
  assert.equal(progress.remainingCount, 0);

  const run = await scenario.initial(seenCaptionIds);
  assert.deepEqual(run.captionOrder, []);

  // The flow still opens — with an empty queue it shows its End Study step, so
  // the run can be saved — rather than the "nothing here" state.
  const html = renderToStaticMarkup(await scenario.study());
  assert.doesNotMatch(html, /No captions available for this study/);
  const props = scenario.flowProps();
  assert.deepEqual(props.captions, []);
  assert.equal(props.remainingCaptionCount, 0);
  assert.equal(props.captionNumberOffset, 3);
  assert.equal(props.initialTotalCaptionCount, 3);
});

test("the start page welcomes a returning participant back and names the caption it opens", async () => {
  const scenario = createStudyScenario({ navigated: [1, 2, 3, 4, 5, 6] });
  renderToStaticMarkup(await scenario.study());

  const props = scenario.flowProps();
  assert.equal(props.captionNumberOffset, 6);
  assert.equal(props.initialTotalCaptionCount, 13);
  assert.equal(props.remainingCaptionCount, 7);
  assert.equal(props.captionOrder.length, 7);
});

test("home shows how far each unfinished study got, and flags one with nothing left", async () => {
  const partway = createStudyScenario({ navigated: [1, 2, 3, 4, 5, 6] });
  const partwayHtml = renderToStaticMarkup(await partway.home());
  assert.match(partwayHtml, /6 of 13 seen/);
  assert.match(partwayHtml, /width:46%/);
  assert.match(partwayHtml, /In progress/);
  assert.doesNotMatch(partwayHtml, /All captions seen/);

  const finished = createStudyScenario({ captionCount: 3, navigated: [1, 2, 3] });
  const finishedHtml = renderToStaticMarkup(await finished.home());
  assert.match(finishedHtml, /3 of 3 seen/);
  assert.match(finishedHtml, /All captions seen/);
  assert.doesNotMatch(finishedHtml, /&gt;In progress&lt;|>In progress</);

  const untouched = createStudyScenario({ participation: null });
  const untouchedHtml = renderToStaticMarkup(await untouched.home());
  assert.doesNotMatch(untouchedHtml, /seen|In progress/);
});

test("a failed progress lookup says so instead of silently restarting the study", async (t) => {
  t.mock.method(console, "error", () => {});
  const scenario = createStudyScenario({
    navigated: [1, 2, 3],
    failTable: "study_caption_navigation_events",
  });

  const { error, progress } = await scenario.progress();
  assert.ok(error);
  assert.equal(progress.seenCount, 0);

  const html = renderToStaticMarkup(await scenario.study());
  assert.match(html, /couldn&#x27;t load your study progress/);
  assert.doesNotMatch(html, /Welcome To|Start Study|Continue from caption/);
});

test("stats parsing keeps a session count and still accepts snapshots saved without one", () => {
  const withSessions = {
    likedCount: 5, viewedCount: 13, medianVoteTimeMs: 2000,
    medianNavigationTimeMs: 2000, sessionCount: 2,
  };
  assert.deepEqual(statsModule.parseStudyStats(withSessions), withSessions);

  const legacy = {
    likedCount: 1, viewedCount: 3, medianVoteTimeMs: 1200, medianNavigationTimeMs: 2000,
  };
  assert.deepEqual(statsModule.parseStudyStats(legacy), legacy);
  assert.equal(statsModule.parseStudyStats({ ...withSessions, sessionCount: -1 }), null);
  assert.equal(statsModule.parseStudyStats({ ...withSessions, sessionCount: 1.5 }), null);
});

test("the stats screen says how many sittings its numbers cover", () => {
  const completed = loadModule("src/components/CompletedStudy.tsx", {
    "@/lib/study-stats": statsModule,
  }).CompletedStudy;
  const across = renderToStaticMarkup(
    completed({
      participation: {
        completion_stats: {
          likedCount: 5, viewedCount: 13, medianVoteTimeMs: 2000,
          medianNavigationTimeMs: 2000, sessionCount: 2,
        },
      },
    })
  );
  assert.match(across, /Across (?:<!-- -->)?2(?:<!-- -->)? sessions/);
  assert.match(across, /Captions seen/);
  assert.match(across, /breaks between sessions are not counted/);

  const single = renderToStaticMarkup(
    completed({
      participation: {
        completion_stats: {
          likedCount: 5, viewedCount: 13, medianVoteTimeMs: 2000,
          medianNavigationTimeMs: 2000, sessionCount: 1,
        },
      },
    })
  );
  assert.match(single, /Across 1 session/);

  const legacy = renderToStaticMarkup(
    completed({
      participation: {
        completion_stats: {
          likedCount: 1, viewedCount: 3, medianVoteTimeMs: 1200, medianNavigationTimeMs: 2000,
        },
      },
    })
  );
  assert.doesNotMatch(legacy, /Across/);
});

function renderVoteFlow(overrides = {}) {
  const flow = loadModule("src/components/CaptionVoteFlow.tsx", {
    "@/app/study/actions": { startStudy: async () => {}, endStudy: async () => {} },
    "@/app/actions": {
      loadMoreCaptionVoteCaptions: async () => ({ success: true, captions: [] }),
      removeCaptionVote: async () => ({ success: true }),
      saveCaptionNavigationEvent: async () => ({ success: true }),
      saveCaptionVote: async () => ({ success: true }),
    },
    "@/lib/study-caption-order": captionOrderModule,
    "@/lib/caption-votes": loadModule("src/lib/caption-votes.ts"),
    "@/components/CompletedStudy": { CompletedStudy: NullComponent },
    "./SwipeVoteCard": { SwipeVoteCard: NullComponent },
  }).CaptionVoteFlow;

  return renderToStaticMarkup(
    createElement(flow, {
      captionNumberOffset: 6,
      captionOrder: [captionId(7)],
      captions: [{
        id: captionId(7), isLiked: false, isSaved: false,
        content: "Caption 7", imageSrc: null, studyCaptionMappingId: 7,
      }],
      initialNextOffset: null,
      initialTotalCaptionCount: 13,
      initialParticipation: {
        profile_id: profileId, study_id: STUDY_ID,
        started_at: "2026-11-01T12:00:00Z", ended_at: null, completion_stats: null,
      },
      remainingCaptionCount: 7,
      studyId: STUDY_ID,
      ...overrides,
    })
  );
}

test("a returning participant reads one line and a button that names its caption", () => {
  const resumed = renderVoteFlow();
  assert.match(resumed, /Welcome back. (?:<!-- -->)?7 captions left./);
  assert.match(resumed, /Continue from caption (?:<!-- -->)?7/);
  assert.doesNotMatch(resumed, /That&#x27;s all you have to do/);
  assert.doesNotMatch(resumed, />Continue Study</);

  const lastOne = renderVoteFlow({ remainingCaptionCount: 1, captionNumberOffset: 12 });
  assert.match(lastOne, /Welcome back. 1 caption left./);
  assert.match(lastOne, /Continue from caption (?:<!-- -->)?13/);
});

test("a first sitting keeps the instructions and the plain Start Study button", () => {
  const first = renderVoteFlow({
    captionNumberOffset: 0,
    remainingCaptionCount: 13,
    initialParticipation: null,
  });
  assert.match(first, /Like the captions you find funny/);
  assert.match(first, /That&#x27;s all you have to do/);
  assert.match(first, />Start Study</);
  assert.doesNotMatch(first, /Welcome back|Continue from caption/);
});

test("reopening a study with nothing left opens its End Study step", () => {
  const nothingLeft = renderVoteFlow({
    captionOrder: [],
    captions: [],
    captionNumberOffset: 13,
    remainingCaptionCount: 0,
  });
  assert.match(nothingLeft, /You&#x27;ve reached the end!/);
  assert.match(nothingLeft, />End Study</);
  assert.doesNotMatch(nothingLeft, /Welcome back|Continue from caption/);
});
