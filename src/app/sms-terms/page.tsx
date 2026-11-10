import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "SMS Terms | Humor Study",
  description: "Consent, frequency, costs, and opt-out instructions for Humor Study text messages.",
};

export default function SmsTermsPage() {
  return (
    <PolicyPage title="SMS Terms">
      <section>
        <h2>The Humor Study text-message program</h2>
        <p>Sparkling Javascript, Inc. operates Humor Study text messages for phone-number verification and optional study reminders. These terms apply to messages sent from our number, +1 754 294 8413. Please also read our <Link href="/privacy">Privacy Policy</Link>.</p>
      </section>
      <section>
        <h2>Verification codes and reminder consent</h2>
        <p>When you enter a phone number, agree to receive verification texts, and request a code in Settings, you consent to automated text messages for verifying that number. You must own or be authorized to use the number you provide. Requesting or confirming a code does not subscribe you to daily study reminders.</p>
        <p>To receive study reminders, separately choose Yes for Text message in <Link href="/settings">Settings</Link> or the notification prompt after sign-in. Choosing Yes consents to automated study-reminder texts at your verified number. No and Skip do not subscribe you. Email and phone-call preferences are separate.</p>
        <p>Phone verification and text messages are optional. Consent to text messages is not required to participate in a study or to make a purchase.</p>
      </section>
      <section>
        <h2>Message frequency and charges</h2>
        <p>Study reminders are scheduled at noon Eastern and occur at most once per day while an active public study remains unfinished for your account. No reminder is due when no qualifying study remains. You may also receive verification codes you request and responses to messaging keywords.</p>
        <p>Message and data rates may apply according to your mobile plan. Your carrier may charge for texts you send or receive. Delivery depends on your carrier and network availability; messages may be delayed or not delivered. Carriers are not liable for delayed or undelivered messages.</p>
      </section>
      <section>
        <h2>How to stop or resume texts</h2>
        <p>Reply STOP to +1 754 294 8413 to stop texts from that number. You may receive a final opt-out confirmation. You can also choose No for Text message in Settings to stop daily study reminders while still being able to request verification codes.</p>
        <p>If you previously replied STOP, reply START to the same number to allow texts again. Your Text message preference must also be Yes for daily study reminders. Choosing Yes in Settings alone does not remove a carrier or provider text-message block. Stopping texts does not change your separate email or phone-call preferences.</p>
        <p>You may also contact <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a> to withdraw consent. Tell us the number involved and whether you want to stop texts, calls, or all reminders. You are not required to use a particular method to request an opt-out.</p>
      </section>
      <section>
        <h2>Help and privacy</h2>
        <p>Reply HELP for messaging help, or contact <a href="mailto:michael@sparklingjavascript.com">michael@sparklingjavascript.com</a>. You can manage your account at <Link href="/settings">Settings</Link>.</p>
        <p>We do not sell or share mobile numbers or SMS opt-in and consent information for third-party marketing or promotional purposes. Service providers receive only the information needed to operate verification and deliver requested communications, as described in our Privacy Policy.</p>
      </section>
      <section>
        <h2>Updates</h2>
        <p>We will post changes to these terms here with a revised effective date. A change that requires new messaging consent will require that consent before it takes effect for you.</p>
        <p>The <Link href="/terms">Terms of Use</Link> govern the website. The <Link href="/notification-terms">Notification Terms</Link> explain email and phone reminders.</p>
      </section>
    </PolicyPage>
  );
}
