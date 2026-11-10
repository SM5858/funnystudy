import { ThemeMenu } from "@/components/theme/ThemeMenu";
import { GoogleSignInForm } from "@/components/GoogleSignInForm";
import { normalizeRelativePath } from "@/lib/url";
import { PolicyLinks } from "@/components/PolicyLinks";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { message, redirectedFrom } = await searchParams;
  const next = normalizeRelativePath(redirectedFrom);
  const displayMessage = Array.isArray(message) ? message[0] : message;

  return (
    <div className="relative flex h-[100svh] flex-col overflow-hidden px-0 text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-amber-500/20 blur-[100px] animate-orb" />
        <div className="absolute right-4 top-6 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl animate-orb-reverse" />
        <div className="absolute bottom-10 right-12 h-60 w-60 rounded-full bg-yellow-400/15 blur-[90px] animate-orb-sway" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.1),transparent_38%),radial-gradient(circle_at_78%_0%,rgba(253,224,71,0.12),transparent_32%)] animate-grid-drift" />
      </div>

      <main className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-12 pb-24 sm:px-8">
        <div className="glass-panel relative my-auto w-full max-w-lg shrink-0 self-center overflow-hidden rounded-3xl px-8 py-9 shadow-[var(--panel-shadow)] sm:px-10 sm:py-11">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--accent-strong)] to-[var(--accent)] animate-shine" />
          <div className="space-y-7">
            <div className="space-y-3 text-left">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--soft)]">
                Humor Study
              </p>
              <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                Welcome back
              </h1>
              <p className="text-sm text-[var(--muted)] sm:text-base">
                Prepare to get crackd.
              </p>
              {displayMessage ? (
                <p className="rounded-xl bg-[color-mix(in_srgb,_var(--accent)_12%,_transparent)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] ring-1 ring-[color-mix(in_srgb,_var(--accent)_35%,_transparent)]">
                  {displayMessage}
                </p>
              ) : null}
            </div>

            <GoogleSignInForm next={next} icon={<GoogleIcon />} />
            <p className="text-sm text-[var(--muted)]"><PolicyLinks /></p>
          </div>
        </div>
      </main>
      <ThemeMenu />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      className="h-5 w-5"
      aria-hidden
      viewBox="0 0 24 24"
      focusable="false"
    >
      <defs>
        <linearGradient id="googleAmberGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path
        fill="url(#googleAmberGradient)"
        d="M21.35 11.1h-9.17v2.92h5.32c-.24 1.36-1.44 4-5.32 4-3.2 0-5.81-2.66-5.81-5.94 0-3.28 2.61-5.94 5.81-5.94 1.82 0 3.04.77 3.74 1.44l2.55-2.46C16.94 3.5 14.75 2.5 12 2.5 6.98 2.5 3 6.48 3 11.5S6.98 20.5 12 20.5c6.15 0 8.5-4.33 8.5-7.41 0-.5-.05-.89-.15-1.99Z"
      />
    </svg>
  );
}
