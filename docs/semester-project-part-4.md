# Semester Project Part 4 — Iteration 3: Refine and complete the upgrade

**Application:** Crackd / The Humor Study (Next.js + Supabase)
**Deployed application (Vercel):** `<PASTE YOUR VERCEL URL HERE>`
**Sign-in:** Google OAuth. Any Google account works; the reviewer is taken through
notification and demographic questions once, then lands on the study list.

---

## 1. User persona

**The returning participant.** A Columbia student who joined the humor study on
their phone, got through part of it between classes, closed the tab, and comes
back a day or two later. They are not a power user, nobody walks them through
the interface, and they will not read instructions. They have two questions when
they open the app again:

1. *Did it remember me, or do I have to start over?*
2. *How much is left?*

Everything in this upgrade is judged against whether those two questions are
answered without anyone explaining the app.

---

## 2. The original user problem (unchanged since Part 1)

`Continue Study` did not continue. Every page load reshuffled the whole caption
list and the counter went back to `1`, so a participant who came back re-judged
captions they had already judged, and the saved completion stats described only
their last sitting. Participants learned not to trust the button, and the study
collected duplicate judgements of the same caption from the same person.

---

## 3. Third Product Manager review

**What was demonstrated.** The Iteration 2 build: `Continue Study` genuinely
resumed — captions already seen were left out of the run, the counter opened at
the participant's real position in the study, the study list showed how far each
unfinished study had got, and the saved completion stats covered every sitting
rather than only the last one.

**Feedback received.** The PM confirmed the resume behaviour itself was now
correct, and gave one theme of feedback for the next round:

> Think about accessibility and UI/UX. It should be immediately understandable
> without a separate explanation. What's there now isn't bad, but try new things
> if they help UI/UX and accessibility.

**How I read it.** Against the persona, that is a specific charge rather than a
general polish request: the resume feature worked, but a participant could only
*tell* it worked if someone told them what to look at, and a participant using a
screen reader could not tell at all. So the work in section 4 is not new
behaviour — it is making the behaviour that already exists visible, speakable,
and operable without being explained.

---

## 4. What changed after Iteration 2

### 4.1 The caption screen now shows how to move, and where you are

Before, the only way to move between captions was a gesture nobody had been told
about — swipe, trackpad scroll, or the arrow keys — and the position was a mute
`12/100` pill marked `aria-hidden`, so a screen reader read nothing at all.

It is now a navigator sitting in the same place: **`Back`** and **`Next`**
buttons either side of a **`7 of 13`** readout with a progress bar under it.

- The buttons are real buttons: visible, keyboard-focusable, 40 px targets, with
  spoken names (`Previous caption` / `Next caption`) that say what moves, since
  "Back" alone could mean leaving the study.
- They take the exact same code path as the gestures, so the end-of-study step,
  the welcome page and the telemetry behave identically however you moved.
- The readout is a `role="progressbar"` carrying the real position, so the bar is
  no longer decoration a screen reader has to skip.
- A polite live region announces `Caption 7 of 13` plus the caption text on every
  move. Before this, a screen reader user moved through the study blind.
- Starting the study moves focus into the caption region instead of dropping it
  on the document body.
- `12/100` became `7 of 13`. A slash reads as a ratio; participants read it as a score.

### 4.2 The start page shows the resume state instead of describing it

A returning participant now sees, above the button:

- `Welcome back. 7 captions left.`
- a **`6 of 13 captions seen`** progress bar — the answer to "did it remember me?"
  arrives before the sentence is read;
- `Captions you have already seen will not come back.` — the promise the whole
  upgrade makes, stated plainly rather than inferred;
- `Move with the Back and Next buttons below, a swipe, or the arrow keys.`
- and the button still names its destination: `Continue from caption 7`.

### 4.3 The study list says what opening a study will do

Each card now ends with the action, not a bare arrow: **`Start`**, **`Continue`**,
**`Finish`** or **`View stats`**. The progress bar on unfinished cards is a
`progressbar` with the same values, the label reads `6 of 13 captions seen`
instead of `6 of 13 seen`, the status badges are proper pills, and the list
header says *"Each study picks up where you left off."*

### 4.4 General accessibility work the feedback opened the door to

- **Reduced motion.** The caption page turn was a full 3-D flip and a like set
  off a screen-wide wash, rings and flying particles. Under
  `prefers-reduced-motion: reduce` the page turn is a short fade and the
  screen-wide parts of the burst are dropped; the caption still turns and the
  heart still pops. This deliberately reverses an earlier project decision to
  ignore the setting everywhere — for a participant who gets motion sick that
  setting is not a preference about decoration.
- **Image alt text.** Caption images said `alt="Caption related"`, which tells a
  screen reader nothing. They now say `Cartoon for the caption above` — honest
  about what the image is rather than pretending to describe a joke we have no
  description of.
- **Progress bar contrast.** The unfilled part of a bar carries meaning (it is
  how much is left) and was nearly invisible in light mode. Progress tracks now
  use a dedicated `--progress-track` token with enough contrast in both themes.

---

## 5. Checking that it works and does not confuse anyone

- `npm run build`, `npm run lint` and `npx tsc --noEmit` all pass.
- All four regression suites pass: `test:resume` (15), `test:demographics` (29),
  `test:images` (6), `test:settings` (34).
- New automated checks were added for this iteration: the navigator renders both
  directions with correct spoken names, the readout and the `progressbar` carry
  the same position, the bar is drawn at the right width, the start page exposes
  the resume progress and the no-repeat promise, and the study cards expose their
  progress and their action word.
- A new `npm run preview:study-ui` renders the real start page and the real
  navigator with the project's compiled CSS, so both screens were looked at in
  **dark and light mode at 375×812 phone size**. The start page fits on a phone
  with the `Continue` button above the fold, and the navigator reads clearly in
  both themes.
- Not yet checked: the running app against a live database on the deployed site.
  The project commandment against overlapping UI was respected by increasing the
  bottom space the study reserves for the bar (34 px → 76 px), so the caption and
  image shrink above it rather than being covered — this is worth one look on the
  deployed site before the demo.

---

## 6. Plan for the next iteration

1. **Demonstrate this revised version and act on the next round of feedback
   first** — whatever the PM raises at the next session takes priority over
   everything below. The specific thing to ask about: whether `Back` / `Next`
   as on-screen buttons makes the study feel slower or more deliberate than the
   swipe-only version, since the gesture is still there and the buttons are an
   addition rather than a replacement.
2. **Verify on the deployed site with a real account**, specifically that the
   taller bottom bar never covers a caption image on a short phone, and that the
   live region announces at a sensible pace when moving quickly.
3. **Apply the `study_caption_navigation_events` / `study_caption_vote_events`
   read migration to staging and production.** Resume depends on the participant
   being able to read back their own events; the migration exists in the
   repository but has not been applied, so this is the remaining gap between the
   code and a live resume.
4. **Make the end of the study as clear as the middle.** The final step says
   "You've reached the end!" with an `End Study` button, but it does not show
   what ending saves. Showing the counts before the button would make the last
   action as self-explanatory as the rest of the flow now is.
5. **Give the stats screen the same treatment** — the numbers are currently raw
   (`2,000 ms`), which no participant reads as "two seconds".
