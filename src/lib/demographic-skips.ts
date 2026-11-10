export const DEMOGRAPHIC_SKIPS_COOKIE = "demographic_skips";

export function readDemographicSkips(
  value: string | undefined,
  profileId: string
): string[] {
  if (!value) return [];

  try {
    const saved = JSON.parse(decodeURIComponent(value));
    if (saved?.profileId !== profileId || !Array.isArray(saved.questionIds)) {
      return [];
    }

    return [
      ...new Set<string>(
        saved.questionIds
          .filter((id: unknown): id is string => typeof id === "string")
          .map((id: string) => id.trim())
          .filter(Boolean)
      ),
    ];
  } catch {
    return [];
  }
}

export function encodeDemographicSkips(
  profileId: string,
  questionIds: readonly string[]
) {
  return encodeURIComponent(
    JSON.stringify({ profileId, questionIds: [...new Set(questionIds)] })
  );
}
