import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Humor Study",
  description: "How Humor Study handles account, study, and notification information.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <section>
        <h2>Who we are</h2>
        <p>Humor Study at www.humorstudy.org is operated by Sparkling Javascript, Inc. This policy explains how we use information when you sign in, participate in a humor study, or request notifications. For privacy questions, contact <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a>.</p>
        <p>Studies are offered to adults age 18 and older located in the United States. Study responses and caption activity support academic research at Columbia University. Please also read the <Link href="/terms">Terms of Use</Link>. This privacy notice does not replace any applicable research informed-consent document or approved consent waiver.</p>
      </section>
      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>Account information from Google sign-in, including your account identifier and email address, and the first and last names you provide.</li>
          <li>A phone number if you choose to add one, its verification status, and your email, text-message, and phone-call notification choices.</li>
          <li>Demographic survey answers you submit, study participation and completion records, caption interactions, timing information, and study statistics.</li>
          <li>Cookies needed to keep you signed in and remember skipped questions, local storage for your theme, and a session-storage identifier used with study activity. Our hosting and service providers may also process IP addresses, browser information, and request or delivery logs to operate and secure the service.</li>
          <li>Information you send when asking for account help, privacy assistance, or changes to notification choices.</li>
        </ul>
      </section>
      <section>
        <h2>How we use information</h2>
        <p>We use account information to sign you in, save your Settings, and associate your answers and study progress with your account. Study responses and activity support academic research at Columbia University and the statistics shown to you. Authorized study administrators and researchers can access information needed to operate and analyze the studies.</p>
        <p>Study activity includes caption ratings and likes, saved captions, navigation and timing events, participation start and completion times, and completion statistics. Demographic answers and study records are associated with your account identifier and may be linked to account information. Participation is not anonymous merely because your name is not displayed beside a caption. Any study-specific consent governs additional research uses, disclosures, and withdrawal rights.</p>
        <p>We use your phone number to send verification codes you request and, when you opt in, study reminders. Each notification channel has a separate choice. Adding or verifying a phone number does not subscribe you to daily reminders. We also use service and delivery records to prevent duplicate notifications, handle errors, and protect accounts.</p>
      </section>
      <section>
        <h2>Mobile information and consent</h2>
        <p>We do not sell personal information or share it with third parties for marketing or promotional purposes. Mobile numbers, notification preferences, and text-message opt-in and consent information are not shared with affiliates or third parties for their marketing, advertising, or lead generation.</p>
        <p>We provide mobile information only to service providers that need it to operate account verification and deliver your requested messages or calls, subject to this purpose. Text-message opt-in and consent information is not used for third-party analytics or unrelated purposes.</p>
      </section>
      <section>
        <h2>Service providers and external content</h2>
        <p>We use Google for sign-in, Supabase for account and data services, AWS for hosting, Resend for email delivery, and Telnyx for text messages and phone calls. These providers process the information needed to perform their services. For example, a delivery provider receives the destination and message we ask it to deliver.</p>
        <p>Some caption images are hosted on other websites. Loading an external image sends a request to its host, which may process your IP address and browser information under its own privacy policy. We do not send your account information or notification consent with those image requests.</p>
        <p>We may disclose information when required by law or when necessary to protect the service or the rights and safety of its users. We do not authorize providers to use mobile opt-in information for their own marketing.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>You can update your name and notification choices in <Link href="/settings">Settings</Link>. Choose No for a channel to stop its study reminders. You can also reply STOP to a text message to stop messages from that sending number, or contact us to withdraw consent to one or all reminder channels. Separate channel choices can be managed in Settings. See the <Link href="/sms-terms">SMS Terms</Link> and <Link href="/notification-terms">Notification Terms</Link> for instructions.</p>
        <p>Phone verification and notifications are optional. You can participate in studies without subscribing to reminders. Skipping a notification question leaves it unanswered; an unanswered choice never permits reminders.</p>
        <p>You can stop participating or leave a study at any time. Stopping participation, signing out, and opting out of reminders do not automatically erase information already collected. Contact us for research withdrawal or data requests so that any applicable study consent and retention obligations can be considered.</p>
      </section>
      <section>
        <h2>Retention, access, and deletion</h2>
        <p>We retain account and study information as needed to provide the service, conduct study analysis, and meet applicable obligations. Verification codes expire and are removed from delivery records; signing out or opting out of notifications does not delete your study records.</p>
        <p>Contact <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a> to request access, correction, or deletion of your personal information. We may need to verify your identity before acting on a request. Information that must be retained for legal obligations or that no longer identifies you may be retained.</p>
        <p>Retention depends on the purpose of the record, account and service needs, applicable research requirements, and legal obligations. This site does not currently offer an automatic account-deletion control or a single fixed retention period for all research records. Backups and provider records may remain for their retention cycles.</p>
        <p>Depending on applicable U.S. state law, you may have rights to obtain a copy of information, correct it, request deletion, or appeal a request decision. Contact us to exercise a right or ask about an appeal; we will explain any verification needs or limits that apply. We do not deny participation merely because you exercise an applicable privacy right. We do not sell personal information, share it for cross-context behavioral advertising, or use it for decisions producing legal or similarly significant effects.</p>
      </section>
      <section>
        <h2>Cookies and tracking choices</h2>
        <p>The <Link href="/cookies">Cookie Policy</Link> describes storage purposes, lifetimes, and browser controls. The application does not set advertising cookies or advertising pixels. We still collect study responses and activity for research and operation of the site.</p>
        <p>We do not use Do Not Track signals to disable essential storage or study measurements. Because the application does not sell information or share it for cross-context behavioral advertising, a Global Privacy Control signal does not change essential site functions. External providers may handle browser signals according to their own policies.</p>
      </section>
      <section>
        <h2>Security and location</h2>
        <p>We use authentication and access controls to restrict access to account and study information, and protect verification and delivery credentials. No online service can guarantee absolute security. Contact us if you believe your account or information has been exposed.</p>
        <p>The site is intended for U.S. participants. Our service providers may process information where they operate; a U.S.-only participant audience does not guarantee that all provider processing occurs exclusively in the United States.</p>
      </section>
      <section>
        <h2>Children and eligibility</h2>
        <p>The site is not directed to children and does not permit study participation by anyone under 18. Do not submit personal information or study responses if you are under 18 or outside the United States. If you believe an underage participant has provided information, contact us so we can investigate and take appropriate action.</p>
      </section>
      <section>
        <h2>Changes to this policy</h2>
        <p>We will post updates on this page with a revised effective date. Changes to notification practices that require new consent will not replace your existing choices without that consent.</p>
        <p>You may also send privacy correspondence to Sparkling Javascript, Inc., 808 Columbus Ave, #22N, New York, NY 10025, United States.</p>
      </section>
    </PolicyPage>
  );
}
