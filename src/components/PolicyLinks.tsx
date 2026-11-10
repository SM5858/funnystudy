import Link from "next/link";

export function PolicyLinks() {
  return (
    <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
      <Link href="/terms" className="underline underline-offset-4">Terms of Use</Link>
      <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
      <Link href="/cookies" className="underline underline-offset-4">Cookie Policy</Link>
      <Link href="/notification-terms" className="underline underline-offset-4">Notification Terms</Link>
      <Link href="/sms-terms" className="underline underline-offset-4">SMS Terms</Link>
    </span>
  );
}
