import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Use | Humor Study",
  description: "Eligibility, account responsibilities, research participation, and terms for using Humor Study.",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of Use">
      <section>
        <h2>Using Humor Study</h2>
        <p>Sparkling Javascript, Inc. operates Humor Study at www.humorstudy.org. These terms govern use of the website and your account. By confirming agreement when you sign in, you agree to these terms. If you do not agree, do not sign in or participate.</p>
        <p>The studies are offered only to adults who are at least 18 years old and located in the United States. Do not create an account or submit study information if you do not meet these requirements. Individual studies may have additional eligibility requirements.</p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>Sign in using a Google account you are authorized to use. Provide accurate account information, keep access to your account secure, and contact us if you suspect unauthorized access. Do not share your account or impersonate another participant. You are responsible for activity you authorize through your account.</p>
        <p>You may update your name and notification choices in <Link href="/settings">Settings</Link>. Only add a phone number you own or are authorized to use, and update it if you lose access to it.</p>
      </section>
      <section>
        <h2>Research participation</h2>
        <p>Study responses, demographic answers, and caption activity are used for academic research at Columbia University. Participation is voluntary. You may stop using the site or stop a study at any time. Not subscribing to notifications does not prevent participation.</p>
        <p>These website terms and the <Link href="/privacy">Privacy Policy</Link> are not an informed-consent form for research. Any applicable study-specific consent document or approved consent waiver governs research participation, including study risks, withdrawal, and use of previously collected information. Agreement to these site terms does not waive any rights as a research participant.</p>
        <p>Study statistics describe activity on this site; they are not a medical, psychological, or other professional assessment. Operation of this website by Sparkling Javascript, Inc. does not imply institutional endorsement of its content or services.</p>
      </section>
      <section>
        <h2>Appropriate use</h2>
        <p>Use the site lawfully and follow study instructions. Do not submit fabricated responses, automate participation without permission, harass others, attempt to access another person’s information, bypass access controls, disrupt the service, or introduce malicious software.</p>
        <p>We may restrict access when reasonably necessary to protect participants, research integrity, or the service, including for violations of these terms. Contact us if you believe an access restriction is a mistake.</p>
      </section>
      <section>
        <h2>Content and rights</h2>
        <p>Images and captions may belong to third parties and may include humor that some people find offensive. You may view content for participation and personal use through the site. Access does not transfer ownership or grant permission to republish or commercially use another person’s work.</p>
        <p>You retain any rights you have in information you submit. You permit us to store and process your submissions to operate the site and for the academic research described in the Privacy Policy, subject to any applicable study consent and law. These terms do not transfer ownership of your submissions or authorize unrelated marketing uses of personal information.</p>
        <p>Contact us about content you believe infringes your rights, with the relevant study or content location, an explanation of your rights, and a way to reach you.</p>
      </section>
      <section>
        <h2>Privacy and optional communications</h2>
        <p>The Privacy Policy explains information collection, sharing, retention, and your choices. The <Link href="/cookies">Cookie Policy</Link> explains browser storage. Email and automated phone reminders are covered by the <Link href="/notification-terms">Notification Terms</Link>; verification texts and text reminders are covered by the <Link href="/sms-terms">SMS Terms</Link>.</p>
        <p>Agreeing to these site terms does not subscribe you to any notification channel. Each channel requires a separate affirmative choice, and you can withdraw that choice.</p>
      </section>
      <section>
        <h2>Availability and responsibility</h2>
        <p>We work to keep the service available and accurate, but studies, features, and content may change or become unavailable. External websites and image hosts operate independently. Do not rely on this site for urgent communications.</p>
        <p>To the extent permitted by applicable law, the service is provided as available without a guarantee of uninterrupted operation or fitness for a particular purpose. Nothing in these terms excludes liability that cannot lawfully be excluded, limits statutory privacy rights, or waives research-participant protections.</p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>We will post updated terms with a revised effective date and provide notice of material changes on the site or through your account email as appropriate. Changes requiring new research or notification consent will require that consent separately.</p>
        <p>For account help, privacy requests, notification opt-outs, or questions about these terms, contact <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a>. You may also write to Sparkling Javascript, Inc., 808 Columbus Ave, #22N, New York, NY 10025, United States.</p>
      </section>
    </PolicyPage>
  );
}
