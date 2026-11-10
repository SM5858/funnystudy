import { normalizeRelativePath } from "@/lib/url";
import { createClient } from "@/lib/supabase/server";

type DynamicQueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

type DynamicQuery = PromiseLike<DynamicQueryResult> & {
  eq(column: string, value: unknown): DynamicQuery;
  in(column: string, values: readonly unknown[]): DynamicQuery;
  limit(count: number): DynamicQuery;
  order(
    column: string,
    options?: { ascending?: boolean; referencedTable?: string }
  ): DynamicQuery;
};

type DynamicTable = {
  insert(values: Record<string, unknown>): Promise<DynamicQueryResult>;
  select(columns?: string): DynamicQuery;
  update(values: Record<string, unknown>): DynamicQuery;
};

type DynamicSupabaseClient = {
  from(table: string): DynamicTable;
};

type RawRow = Record<string, unknown>;

export type DemographicOption = {
  id: string;
  label: string;
  mappingId: string;
  order: number;
};

export type DemographicQuestion = {
  description: string | null;
  id: string;
  inputType: "choice" | "text";
  options: DemographicOption[];
  order: number;
  prompt: string;
};

export type DemographicSurveyState =
  | {
      error: null;
      pendingQuestions: DemographicQuestion[];
      questions: DemographicQuestion[];
    }
  | {
      error: string;
      pendingQuestions: [];
      questions: [];
    };

const DEMOGRAPHIC_TABLES = {
  answerChoices: [
    "demographic_answers",
    "demographics_answers",
  ],
  questionAnswerMappings: [
    "demographic_answer_question_mapping",
    "demographic_question_answer_mappings",
    "demographics_question_answer_mappings",
    "demographic_questions_answers",
    "demographics_questions_answers",
    "demographic_question_answers",
  ],
  questions: ["demographic_questions", "demographics_questions"],
  userAnswers: [
    "demographic_user_responses",
    "profile_demographic_answers",
    "profile_demographic_question_answers",
    "demographic_user_answers",
    "demographics_user_answers",
    "user_demographic_answers",
    "user_demographics_answers",
  ],
} as const;

const ANSWER_PROFILE_COLUMNS = ["profile_id", "user_id"] as const;
const ANSWER_QUESTION_COLUMNS = [
  "demographic_question_id",
  "question_id",
] as const;
const ANSWER_CHOICE_ID_COLUMNS = [
  "demographic_answer_id",
  "answer_id",
  "option_id",
  "id",
] as const;
const MAPPING_ANSWER_COLUMNS = [
  "answer_id",
  "demographic_answer_id",
] as const;
const MAPPING_ID_COLUMNS = ["id", "mapping_id"] as const;
const MAPPING_QUESTION_COLUMNS = [
  "question_id",
  "demographic_question_id",
] as const;
const USER_ANSWER_MAPPING_COLUMNS = [
  "answer_question_mapping_id",
  "demographic_question_answer_mapping_id",
  "question_answer_mapping_id",
  "mapping_id",
] as const;

function fromDynamic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string
) {
  return (supabase as unknown as DynamicSupabaseClient).from(table);
}

function rowsFrom(data: unknown): RawRow[] {
  return Array.isArray(data)
    ? data.filter((row): row is RawRow => row !== null && typeof row === "object")
    : [];
}

function firstString(row: RawRow, keys: readonly string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toString();
    }
  }

  return null;
}

function firstNumber(row: RawRow, keys: readonly string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function valueKey(row: RawRow, keys: readonly string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]);
    }
  }

  return null;
}

function isDeleted(row: RawRow) {
  const deletedValue = row.is_deleted ?? row.deleted;

  if (
    deletedValue === true ||
    deletedValue === 1 ||
    deletedValue === "true" ||
    deletedValue === "1"
  ) {
    return true;
  }

  return Boolean(
    row.deleted_at ??
      row.deleted_datetime_utc ??
      row.archived_at ??
      row.archived_datetime_utc
  );
}

async function readFirstAvailableTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tableNames: readonly string[]
) {
  for (const tableName of tableNames) {
    const { data, error } = await fromDynamic(supabase, tableName).select("*");

    if (!error) {
      return { rows: rowsFrom(data), tableName };
    }
  }

  return null;
}

async function readAnswerRowsForProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
) {
  for (const tableName of DEMOGRAPHIC_TABLES.userAnswers) {
    for (const profileColumn of ANSWER_PROFILE_COLUMNS) {
      const { data, error } = await fromDynamic(supabase, tableName)
        .select("*")
        .eq(profileColumn, profileId);

      if (!error) {
        return { rows: rowsFrom(data), tableName };
      }
    }
  }

  return null;
}

function normalizeAnswerChoice(row: RawRow): Omit<DemographicOption, "mappingId" | "order"> | null {
  const id = valueKey(row, ANSWER_CHOICE_ID_COLUMNS);

  if (!id || isDeleted(row)) {
    return null;
  }

  const label =
    firstString(row, ["answer", "label", "option_text", "text", "value", "name"]) ??
    `Answer ${id}`;

  return { id, label };
}

function buildOptionsByQuestionId(
  mappingRows: readonly RawRow[],
  answerRows: readonly RawRow[]
) {
  const answersById = new Map<string, Omit<DemographicOption, "mappingId" | "order">>();
  const optionsByQuestionId = new Map<string, DemographicOption[]>();

  for (const row of answerRows) {
    const answer = normalizeAnswerChoice(row);

    if (answer) {
      answersById.set(answer.id, answer);
    }
  }

  for (const mapping of mappingRows) {
    const mappingId = valueKey(mapping, MAPPING_ID_COLUMNS);
    const questionId = valueKey(mapping, MAPPING_QUESTION_COLUMNS);
    const answerId = valueKey(mapping, MAPPING_ANSWER_COLUMNS);

    if (!mappingId || !questionId || !answerId || isDeleted(mapping)) {
      continue;
    }

    const answer = answersById.get(answerId);

    if (!answer) {
      continue;
    }

    const order =
      firstNumber(mapping, [
        "order_by",
        "display_order",
        "sort_order",
        "position",
        "priority",
        "id",
      ]) ?? 0;

    optionsByQuestionId.set(questionId, [
      ...(optionsByQuestionId.get(questionId) ?? []),
      { ...answer, mappingId, order },
    ]);
  }

  return optionsByQuestionId;
}

function normalizeQuestion(
  row: RawRow,
  optionsByQuestionId: ReadonlyMap<string, DemographicOption[]>
): DemographicQuestion | null {
  const id = valueKey(row, ["id", "question_id"]);

  if (!id || isDeleted(row)) {
    return null;
  }

  const prompt =
    firstString(row, ["question_text", "question", "prompt", "title", "text", "label"]) ??
    `Question ${id}`;
  const description = firstString(row, ["description", "helper_text", "help_text"]);
  const order =
    firstNumber(row, ["order_by", "display_order", "sort_order", "position", "priority", "id"]) ??
    0;
  const options = [...(optionsByQuestionId.get(id) ?? [])].sort(
    (left, right) => left.order - right.order || left.label.localeCompare(right.label)
  );

  if (!options.length) {
    return null;
  }

  return {
    description,
    id,
    inputType: "choice",
    options,
    order,
    prompt,
  };
}

function answeredQuestionIds(
  rows: readonly RawRow[],
  profileId: string,
  questionIdByMappingId: ReadonlyMap<string, string>
) {
  const ids = new Set<string>();

  for (const row of rows) {
    if (isDeleted(row)) {
      continue;
    }

    const rowProfileId = valueKey(row, ANSWER_PROFILE_COLUMNS);
    const mappingId = valueKey(row, USER_ANSWER_MAPPING_COLUMNS);
    const questionId =
      valueKey(row, ANSWER_QUESTION_COLUMNS) ??
      (mappingId ? questionIdByMappingId.get(mappingId) ?? null : null);

    if (rowProfileId === profileId && questionId) {
      ids.add(questionId);
    }
  }

  return ids;
}

function parseSkippedQuestionIds(skippedQuestionIds: readonly string[] = []) {
  return new Set(
    skippedQuestionIds.map((id) => id.trim()).filter((id) => id.length > 0)
  );
}

export async function fetchDemographicSurveyState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  skippedQuestionIds: readonly string[] = []
): Promise<DemographicSurveyState> {
  const questionTable = await readFirstAvailableTable(
    supabase,
    DEMOGRAPHIC_TABLES.questions
  );

  if (!questionTable) {
    return {
      error: "Could not load demographic survey questions.",
      pendingQuestions: [],
      questions: [],
    };
  }

  const [mappingTable, answerChoiceTable, answerTable] = await Promise.all([
    readFirstAvailableTable(supabase, DEMOGRAPHIC_TABLES.questionAnswerMappings),
    readFirstAvailableTable(supabase, DEMOGRAPHIC_TABLES.answerChoices),
    readAnswerRowsForProfile(supabase, profileId),
  ]);

  if (!mappingTable || !answerChoiceTable || !answerTable) {
    return {
      error: "Could not load demographic survey answers or mappings.",
      pendingQuestions: [],
      questions: [],
    };
  }

  const optionsByQuestionId = buildOptionsByQuestionId(
    mappingTable.rows,
    answerChoiceTable.rows
  );
  const questionIdByMappingId = new Map<string, string>();

  for (const row of mappingTable.rows) {
    const mappingId = valueKey(row, MAPPING_ID_COLUMNS);
    const questionId = valueKey(row, MAPPING_QUESTION_COLUMNS);

    if (mappingId && questionId && !isDeleted(row)) {
      questionIdByMappingId.set(mappingId, questionId);
    }
  }

  const answeredIds = answeredQuestionIds(
    answerTable.rows,
    profileId,
    questionIdByMappingId
  );
  const skippedIds = parseSkippedQuestionIds(skippedQuestionIds);
  const questions = questionTable.rows
    .map((row) => normalizeQuestion(row, optionsByQuestionId))
    .filter((question): question is DemographicQuestion => question !== null)
    .sort(
      (left, right) => left.order - right.order || left.prompt.localeCompare(right.prompt)
    );
  const pendingQuestions = questions.filter(
    (question) => !answeredIds.has(question.id) && !skippedIds.has(question.id)
  );

  return { error: null, pendingQuestions, questions };
}

export async function hasPendingDemographicQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  skippedQuestionIds: readonly string[] = []
) {
  const state = await fetchDemographicSurveyState(supabase, profileId, skippedQuestionIds);

  if (state.error) {
    console.error("[Demographics] survey check failed", state.error);
    return false;
  }

  return state.pendingQuestions.length > 0;
}

export function parseDemographicAnswerSelection(selection: string | null | undefined) {
  const [mappingId, answerId] = selection?.split("::", 2) ?? [];

  if (!mappingId?.trim() || !answerId?.trim()) {
    return null;
  }

  return {
    answerId: answerId.trim(),
    mappingId: mappingId.trim(),
  };
}

function answerPayloads({
  answerId,
  mappingId,
  profileId,
  questionId,
}: {
  answerId: string;
  mappingId: string;
  profileId: string;
  questionId: string;
}) {
  const normalizedAnswerId = normalizeDatabaseId(answerId);
  const normalizedMappingId = normalizeDatabaseId(mappingId);
  const normalizedQuestionId = normalizeDatabaseId(questionId);
  const auditPayload = {
    created_by_user_id: profileId,
    modified_by_user_id: profileId,
  };

  return [
    {
      answer_question_mapping_id: normalizedMappingId,
      user_id: profileId,
    },
    {
      ...auditPayload,
      demographic_answer_id: normalizedAnswerId,
      demographic_question_id: normalizedQuestionId,
      demographic_question_answer_mapping_id: normalizedMappingId,
      profile_id: profileId,
    },
    {
      demographic_answer_id: normalizedAnswerId,
      demographic_question_id: normalizedQuestionId,
      demographic_question_answer_mapping_id: normalizedMappingId,
      profile_id: profileId,
    },
    {
      ...auditPayload,
      answer_id: normalizedAnswerId,
      demographic_question_id: normalizedQuestionId,
      question_answer_mapping_id: normalizedMappingId,
      profile_id: profileId,
    },
    {
      answer_id: normalizedAnswerId,
      demographic_question_id: normalizedQuestionId,
      question_answer_mapping_id: normalizedMappingId,
      profile_id: profileId,
    },
    {
      ...auditPayload,
      answer_id: normalizedAnswerId,
      mapping_id: normalizedMappingId,
      question_id: normalizedQuestionId,
      user_id: profileId,
    },
    {
      answer_id: normalizedAnswerId,
      mapping_id: normalizedMappingId,
      question_id: normalizedQuestionId,
      user_id: profileId,
    },
  ];
}

function normalizeDatabaseId(value: string | null) {
  if (!value) {
    return null;
  }

  return /^\d+$/.test(value) ? Number(value) : value;
}

export async function saveDemographicAnswer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    answerId,
    mappingId,
    profileId,
    questionId,
  }: {
    answerId: string;
    mappingId: string;
    profileId: string;
    questionId: string;
  }
) {
  const payloads = answerPayloads({ answerId, mappingId, profileId, questionId });

  for (const tableName of DEMOGRAPHIC_TABLES.userAnswers) {
    for (const payload of payloads) {
      const { error } = await fromDynamic(supabase, tableName).insert(payload);

      if (!error) {
        return { error: null };
      }
    }
  }

  return { error: "Could not save your survey answer." };
}

export function buildDemographicsPath({
  message,
  next,
  skippedQuestionIds,
}: {
  message?: string | null;
  next: string;
  skippedQuestionIds?: Iterable<string>;
}) {
  const url = new URL("/demographics", "http://localhost");
  const nextPath = normalizeRelativePath(next);

  url.searchParams.set("next", nextPath);

  for (const questionId of skippedQuestionIds ?? []) {
    url.searchParams.append("skipped", questionId);
  }

  if (message) {
    url.searchParams.set("message", message);
  }

  return `${url.pathname}${url.search}`;
}
