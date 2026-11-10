import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Cookie Policy | Humor Study",
  description: "Cookies, local storage, session storage, and tracking choices on Humor Study.",
};

export default function CookiesPage() {
  return (
    <PolicyPage title="Cookie Policy">
      <section>
        <h2>Browser storage we use</h2>
        <p>Humor Study, operated by Sparkling Javascript, Inc., uses cookies and browser storage to operate sign-in, remember choices, and associate study activity with a session. Cookies are small values sent with website requests; local and session storage remain in your browser and are read by the site. See our <Link href="/privacy">Privacy Policy</Link> for how the related information is used.</p>
        <ul>
          <li><strong>Authentication cookies:</strong> Supabase cookies maintain and refresh your signed-in session. Their lifetime depends on your authentication session and refresh behavior. Signing out clears this site’s authentication session.</li>
          <li><strong>Sign-in destination:</strong> The login_next cookie remembers the page you requested while Google sign-in completes. It expires after ten minutes.</li>
          <li><strong>Skipped questions:</strong> The demographic_skips and notification_skips session cookies remember questions you skip during the current login. Successful sign-in clears these skips so unanswered questions can be asked again.</li>
          <li><strong>Theme:</strong> Local storage named theme-preference remembers your light, dark, or system theme until you change it or clear browser storage.</li>
          <li><strong>Study session:</strong> Session storage named captionVoteSessionId holds a random session identifier used with caption activity records. Session storage normally lasts for the browser tab’s session; browser session restoration may retain it.</li>
        </ul>
      </section>
      <section>
        <h2>Advertising, tracking, and external services</h2>
        <p>The application does not set advertising cookies or use advertising pixels to follow you across websites. We do record your answers, caption interactions, and timing information for the site and academic research at Columbia University. Avoiding advertising cookies does not make that study activity anonymous.</p>
        <p>Google sign-in and externally hosted caption images may involve requests to other websites. Those providers may use their own cookies and process request information under their own policies. Our hosting and account providers also process operational and security logs.</p>
        <p>We do not use browser Do Not Track signals to disable essential storage or study measurements. The application does not sell personal information or share it for cross-context behavioral advertising; it does not use a Global Privacy Control signal to alter essential site functions.</p>
      </section>
      <section>
        <h2>Your controls</h2>
        <p>You can use browser settings to block or clear cookies, local storage, and session storage, and can change your theme from the account menu. Blocking authentication storage may prevent sign-in or saving study progress. Clearing stored skips may cause unanswered questions to reappear.</p>
        <p>Clearing browser storage does not delete information already saved to your account or study records. Contact <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a> for questions or a personal-information request.</p>
      </section>
    </PolicyPage>
  );
}
