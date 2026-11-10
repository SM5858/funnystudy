import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Notification Terms | Humor Study",
  description: "Optional email and automated phone reminders, frequency, consent, and opt-out choices.",
};

export default function NotificationTermsPage() {
  return (
    <PolicyPage title="Notification Terms">
      <section>
        <h2>Optional study reminders</h2>
        <p>Sparkling Javascript, Inc. operates Humor Study reminders. Choosing Yes for a channel in <Link href="/settings">Settings</Link> or the prompt after sign-in requests reminders through that channel. Email, text message, and phone call are independent choices. No, Skip, and Not answered do not give permission to send reminders.</p>
        <p>Reminders are optional and consent is not a condition of participating in a study or of any purchase. Agreeing to the website’s Terms of Use, adding a phone number, or verifying it does not subscribe you to reminders.</p>
      </section>
      <section>
        <h2>Frequency and delivery</h2>
        <p>Reminders are scheduled daily at noon Eastern, with daylight saving time observed, at most once per day per selected channel while an active public study remains unfinished for your account. No study reminder is due if there is no qualifying study. Delivery may be delayed or fail because of provider or network availability.</p>
        <p>These are study invitations, not emergency communications. Service availability and your notification preferences determine whether a reminder can be sent.</p>
      </section>
      <section>
        <h2>Email reminders</h2>
        <p>Choosing Yes for Email requests study-reminder emails at your account email address. Each reminder includes a link to manage your choices in Settings. Choosing No stops future study-reminder emails; this does not prevent account or security messages necessary to operate your account.</p>
      </section>
      <section>
        <h2>Automated phone calls</h2>
        <p>Choosing Yes for Phone call consents to automated study-reminder calls using an artificial or prerecorded voice from Humor Study, operated by Sparkling Javascript, Inc., at the verified number on your account. Calls originate from +1 754 294 8413. Provide only a number you own or are authorized to use, and update your account if your number changes or you lose access to it.</p>
        <p>Your phone plan may charge for calls. A reminder may be answered by voicemail or another person with access to your phone. Choose No for Phone call in Settings to stop future phone reminders, or contact us to withdraw consent. The call identifies Sparkling Javascript, Inc. and gives its business contact number, <a href="tel:+13104255555">+1 310 425 5555</a>. The automated sending number itself is not a staffed support line.</p>
      </section>
      <section>
        <h2>Text messages</h2>
        <p>Verification texts require a separate request and consent. Automated study texts require Yes for Text message and a verified number. Message and data rates may apply. Reply STOP to stop texts or HELP for help. The <Link href="/sms-terms">SMS Terms</Link> provide full instructions, including how to resume texts after a provider block.</p>
      </section>
      <section>
        <h2>Changing your choices and getting help</h2>
        <p>You may withdraw reminder consent at any time by choosing No for the relevant channel in Settings or contacting <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a>. Tell us which email address or phone number is involved and whether you want to stop one channel or all reminders. You do not have to use Settings to make a request. A message or call already handed to a delivery provider may still arrive.</p>
        <p>Opting out of reminders does not delete your account or study records or withdraw you from research. For information about your data and requests, read the <Link href="/privacy">Privacy Policy</Link>.</p>
        <p>We will post updates with a revised effective date. Changes requiring new consent will require it separately. Contact us with notification questions or write to Sparkling Javascript, Inc., 808 Columbus Ave, #22N, New York, NY 10025, United States.</p>
      </section>
    </PolicyPage>
  );
}
