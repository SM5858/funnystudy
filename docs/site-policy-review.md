# Site policies and research readiness

Reviewed October 4, 2026 against the repository’s actual data collection and notification flows. The operator confirmed an audience of adults 18 and older in the United States, and academic research at Columbia University. The site operator is Sparkling Javascript, Inc.; Columbia’s name describes the stated research purpose, not an institutional endorsement or a verified IRB approval.

## Published coverage

| Page | Coverage |
| --- | --- |
| `/terms` | Eligibility, account responsibilities, voluntary participation, acceptable use, content rights, service availability, and operator contact. No forced arbitration or waiver of research-participant rights. |
| `/privacy` | Google/account information; optional verified phones and preferences; account-linked demographics, votes, saved captions, navigation timings, participation and completion data; authorized research access; providers; external image requests; retention criteria; manual privacy requests; eligibility; security; tracking signals. |
| `/cookies` | Authentication cookies, ten-minute `login_next`, session skip cookies, persistent theme storage, study-session storage, external services, and browser controls. No advertising pixels are installed by this application. |
| `/notification-terms` | Independent email/automated-voice consent, daily noon Eastern frequency, qualifying studies, charges, verified-number ownership, voicemail, and withdrawal through Settings or operator contact. |
| `/sms-terms` | Separate requested verification texts and reminder opt-in, frequency, message/data rates, STOP/START/HELP, provider blocks, and prohibition on marketing use of mobile consent. The registered campaign’s policy URLs remain unchanged. |

All five pages are public without an Auth round trip. Links appear on login, Settings, every notification prompt, and each policy page. The account menu links to the policies from protected study/demographic pages. Pages and login scroll internally on short screens while keeping the browser viewport locked.

Sign-in requires an unchecked age/U.S./Terms self-attestation, validated before OAuth begins. This is a self-attestation, not age or geolocation verification. Existing signed-in sessions are not retroactively challenged, and site-term acceptance is not stored as a versioned consent record. The checkbox does not change notification preferences or constitute research consent.

The voice notice now identifies the registered operator and gives the supplied business contact number, distinct from the automated sending number. Migration `20261004043000_identify_study_phone_reminder_operator.sql` replaces only the XML generator and updates unclaimed queued instructions. It preserves delivery configuration and accepted/uncertain requests. `scripts/study-voice.mjs update-notice production|staging` records this migration atomically; `check` runs rollback-only mocked delivery regressions.

Applied and verified in both databases on October 4, 2026 UTC. Production scheduling remains enabled with no eligible recipients, no verified phone accounts, and no queued calls at verification; staging remains disabled. All verification HTTP was mocked and fixtures rolled back.

## Research information still required

The operator confirmed that the research materials have not been prepared. The repository has no study-specific informed-consent page, consent acknowledgement record, or documentation establishing a consent waiver or exemption. Before treating this site as ready for Columbia research collection, obtain the principal investigator/research contact, the applicable IRB determination, the approved consent text or waiver/exemption, and approved retention, sharing, publication, and withdrawal rules. Demographic collection occurs before the caption study, so any required consent must cover that collection too.

[Draft participant information](research-participant-information-draft.md) is available for the Columbia team’s review, with unresolved investigator decisions marked. It is not served as a participant consent page. Resolve the applicable research requirements before collecting further research responses; site policies alone do not establish that research is ready. Research collection has not been automatically paused by this policy release.

Site terms and a privacy notice cannot substitute for IRB-approved research consent. Do not claim IRB approval, anonymity, a fixed research retention period, unrestricted publication of individual records, or consent for model training without supporting authorization. Once approved materials are supplied, implement the required timing and durable acknowledgement/version records, if applicable, and reconcile the public privacy notice with them.

## Operator responsibilities

Monitor `michael@sparklingjavascript.com` and the business contact number for privacy, research, and notification requests. Honor reasonable opt-out requests made outside Settings too; clearly scoped requests apply to the indicated channel, and broad requests to all requested reminders. Verify identity proportionately for data access/deletion, document applicable retention exceptions and any appeal rights, and respond within deadlines that actually apply. The application does not automate inbox processing, account deletion, or research withdrawal.

No fixed research purge schedule has been implemented. Establish and document the approved schedule, including backups, provider delivery records, and de-identification rules; the policy currently explains purpose-based retention and manual requests rather than promising an automatic deadline.

Before SMS activation, confirm and implement any required coupling between SMS and voice consent revocation. Telnyx’s current STOP response blocks texts; the application has no incoming-message webhook to propagate that block to voice preferences. The FCC’s [January 2026 waiver](https://docs.fcc.gov/public/attachments/DA-26-12A1.pdf) delays a requirement concerning unrelated informational matters until January 31, 2027; do not assume that the waiver exempts related study reminders sent by different channels. The operator must also handle broad or otherwise applicable revocation requests through contact channels.

The current reminders are academic study invitations. If their primary purpose changes to commercial promotion, review the email templates and unsubscribe flow against CAN-SPAM, including postal identification and the required opt-out mechanism. Do not assume that a Settings link requiring login satisfies every commercial-email requirement. Likewise, the current voice call is an opted-in informational reminder; advertising, exemption-based calls, or changes to consent may require additional mechanisms. SMS remains disabled pending carrier provisioning/number assignment and opt-out readiness. Telnyx now reports TCR acceptance; that is not evidence of completed number assignment.

Determine which state privacy statutes apply to the operator’s actual revenue, processing scale, and practices. The published notice offers applicable rights without asserting that every state statute applies. Review these policies with the Columbia research team and counsel before representing that every research/legal requirement is satisfied.

## Primary references

- [Columbia’s February 2026 informed-consent policy](https://research.columbia.edu/sites/research.columbia.edu/files/content/HRPO/Policies%20%26%20Guidance/Informed%20Consent%20Policy%2020260201%20final%20clean.pdf), [IRB protocol and consent resources](https://research.columbia.edu/irb-protocol-and-consent-form-resources), and [HHS informed-consent guidance](https://www.hhs.gov/ohrp/regulations-and-policy/guidance/faq/informed-consent/index.html): research consent, an applicable approved waiver, or the appropriate exemption must be established separately from website terms.
- [FTC guidance on protecting personal information](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business): accurate practices, limited access, and justified retention.
- [California Attorney General privacy-policy guidance](https://oag.ca.gov/sites/all/files/agweb/pdfs/cybersecurity/making_your_privacy_practices_public.pdf): collection, sharing, changes, tracking signals, and accessible notices. [CCPA guidance](https://oag.ca.gov/privacy/ccpa) describes conditional applicability and rights.
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions): children’s privacy obligations depend on audience and actual knowledge; an adult audience declaration is not proof of age.
- [47 CFR 64.1200](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200), particularly paragraphs (a)(10)–(11) and (b)(1)–(2): reasonable consent revocation and artificial-voice operator/contact identification.
- [FTC CAN-SPAM guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business): applicability depends on the message’s primary purpose, with specific requirements for commercial email.
- [Telnyx privacy-policy and SMS terms requirements](https://support.telnyx.com/en/articles/8159875-10dlc-privacy-policy-terms-and-conditions-best-practices): public opt-in disclosures and no sharing of mobile opt-in information for third-party marketing.

## Verification

Run `npm run test:settings` for public-route isolation, policy discovery, explicit terms confirmation, rejected forged/duplicate values, clean OAuth callback behavior, and independent notification choices. Run `npm run lint`, `npm run test:demographics`, `npm run test:images`, and `npm run build`. Use `npm run preview:settings` for controlled desktop/mobile browser checks without real participants or provider deliveries. Verify every public policy route and the new login notice after Amplify deployment.
