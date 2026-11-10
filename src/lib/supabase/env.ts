const SUPABASE_PUBLIC_KEY_LABEL =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY";

const getTrimmedEnvValue = (value: string | undefined) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
};

export const getSupabasePublicEnv = () => {
  const supabaseUrl = getTrimmedEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const supabasePublicKey =
    getTrimmedEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    getTrimmedEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error(
      `Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and ${SUPABASE_PUBLIC_KEY_LABEL}.`
    );
  }

  return { supabaseUrl, supabasePublicKey };
};
