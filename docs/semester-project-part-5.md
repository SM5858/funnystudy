# Semester Project Part 5 — Iteration 4: Improve the user experience

**Application:** Crackd / The Humor Study (Next.js + Supabase)
**Deployed application (Vercel):** https://funnystudy-beta.vercel.app

**Sign-in:** Google OAuth. Any Google account works; you are taken through the
notification and demographic questions once, then land on the study list.

**How to see the upgrade:** open the study, like a few captions, then **leave
without ending the study** — close the tab or go back to the study list. Come
back to the same study: the card shows how far you got, the start page shows it
again and says the captions you have already seen will not come back, and the
button names the caption it will open. Inside the study, the bar at the bottom
shows your position and carries the `Back` and `Next` buttons. Scroll to the end
to see the final step and, after ending, the stats.

---

## 1. User persona

**The returning participant.** A Columbia student who joined the humor study on
their phone, got through part of it between classes, closed the tab, and comes
back a day or two later. They are not a power user, nobody walks them through
the interface, and they will not read instructions.

For the first three iterations their two questions were *did it remember me?*
and *how much is left?* Both are now answered on sight. This iteration follows
that same person to the end of the study, where two questions were still
unanswered: *what happens if I press this?* and *what do these numbers mean?*

---

## 2. The original user problem (unchanged since Part 1)

`Continue Study` did not continue. Every page load reshuffled the whole caption
list and the counter went back to `1`, so a participant who came back re-judged
captions they had already judged, and the saved completion stats described only
their last sitting.

---

## 3. Fourth Product Manager review

**What was demonstrated.** The Iteration 3 build, shown as the resume flow
end to end: open the study, like captions, leave partway, return, and see the
study list card, the start page progress and the caption navigator all report
the same position.

**Feedback received.** The PM had no changes to request — the resume flow worked
as demonstrated and the implementation was accepted. What they gave instead was
a standing constraint on anything built from here: keep improving, but whatever
is changed or added should be justified by UI/UX and accessibility and nothing
else.

Part 4 was also returned at **100/100**, including full marks for the working
revised version and for the next-iteration plan.

**How I read it.** No new defect was named, so the work for this round had to
come from the plan Part 4 already committed to, and every item had to earn its
place on UI/UX or accessibility grounds alone. Two items on that plan qualified
directly, and working through them surfaced a third problem of the same kind.

---

## 4. What changed after Iteration 3

### 4.1 The last step now says what pressing the button does

The final step was a line of text and a button: *"You've reached the end! End
the study to save your completion and see your humor stats."* It did not say how
much it was about to record, and it did not say that ending is permanent — a
participant only discovers that when they reopen the study and find the captions
gone.

It now shows, above the button:

- a completed progress bar reading **`All 13 captions seen`**, exposed as a
  `progressbar` so a screen reader gets the same confirmation;
- *"Ending the study saves your completion and opens your humor stats, counting
  every session you spent on it."* — which answers what the button does and that
  earlier sittings are included;
- *"This is the last step. Once a study is ended you cannot go back to its
  captions."* — the consequence, stated before the press rather than discovered
  after it.

### 4.2 The last step stopped hiding its way back

Iteration 3 gave the caption screen visible `Back` and `Next` buttons because
the only way to move was a gesture nobody had been told about. The final step
still had that problem: a participant who wanted one more look at a caption had
to know to swipe. It now has a **`Back to captions`** button under `End Study`.

It appears only when this sitting has a caption behind it. A participant who
returns with everything already seen opens straight onto this step with an empty
queue, and there a `Back` button would do nothing when pressed — worse than no
button. The back arrow to the study list is still in the corner either way.

### 4.3 The stats are written for participants, not for the database

The stats screen reported `1,344 ms`. Nobody reads that as "about a second and a
third", and it is the only screen a participant gets for finishing.

| Before | After |
| --- | --- |
| `Median time before like` · `1,344 ms` | `Typical time before a like` · `1.3 seconds` |
| `Median time before next caption` · `2,000 ms` | `Typical time before moving on` · `2.0 seconds` |
| `Upvote percentage` | `Percent you liked` |
| timings listed first | counts listed first |

- **Durations** go through a new `formatStudyDuration`, which rounds before it
  picks a unit, so 9.95 s reads as `10 seconds` and not `10.0 seconds`, and
  59.5 s reads as `1 minute` and not `60 seconds`. A missing value says
  `Not recorded` rather than an em dash a screen reader reads as nothing.
- **`Upvote percentage`** was left over from a voting UI this app no longer has
  — there are no upvotes, only hearts. It is now `Percent you liked`.
- **"Median"** was replaced with "Typical", with a footnote explaining that it
  is the middle of your times so one long pause does not move it. The word was
  accurate and unread; the footnote keeps the accuracy.
- The grid is now a **definition list**, so a screen reader reads each number
  together with the thing it counts instead of a run of loose headings and
  figures.

### 4.4 Focus follows the participant to the end

Iteration 3 moved focus into the caption region when the study starts. The same
gap existed twice more: opening the last step and ending the study each replace
the control that had focus, dropping a keyboard or screen-reader user onto the
document body with nothing announced. Focus now moves onto the final step when
it opens, and onto the stats when ending succeeds.

---

## 5. Checking that it works and does not confuse anyone

- `npm run build`, `npm run lint` and `npx tsc --noEmit` all pass.
- All four regression suites pass: `test:resume` (17), `test:demographics` (29),
  `test:images` (6), `test:settings` (34).
- New automated checks this round: every duration boundary including the two
  rounding traps above; the final step showing `All 13 captions seen` with the
  matching `progressbar` value, the finality sentence, and `Back to captions`
  present with a caption behind it and **absent** when the queue is empty; and
  the stats screen rendering as a `dl` with seconds rather than milliseconds.
- `npm run preview:study-ui` now also renders the final step and the stats
  screen, so both were looked at in **dark and light mode at 375×812 phone
  size** alongside the screens from last round. Both fit on a phone.
- The deployed site was checked signed in: the study list and a completed
  study's stats render from this build.
- Still unchecked: the caption screen against real images on a short phone. The
  account used for testing has already completed the only study available to it,
  so it opens its stats rather than captions. A reviewer signing in with a fresh
  account sees the full caption flow.

---

## 6. Plan for the next iteration

1. **Demonstrate this version and act on the next round of feedback first.**
   The specific thing to ask: the finality sentence on the last step is honest
   but it may now read as a warning in front of the one action we want people to
   take. If PMs or participants hesitate there, the fix is to make it a quieter
   confirmation after the press rather than a caution before it.
2. **Apply the `study_caption_navigation_events` / `study_caption_vote_events`
   read migration to staging and production.** Resume depends on a participant
   being able to read back their own recorded events. The migration is written
   and re-runnable in the repository but has not been applied, and it is now the
   last gap between the code and a live resume.
3. **Watch the bottom bar against real caption images on a short phone.** The
   geometry is measured and safe (the bar occupies 66 px of the 76 px reserved
   for it); what is unverified is how it feels over a full-bleed cartoon.
4. **Give the study list the same ending-state clarity.** A card still says
   `All captions seen — finish to save it` in small text; now that the final
   step explains itself, the card could say the same thing in the same words.
5. **Check the live region's pacing.** It announces position and caption text on
   every move, which is right for one move at a time and may be too talkative
   when someone scrolls quickly. Worth hearing with an actual screen reader
   before changing it.
