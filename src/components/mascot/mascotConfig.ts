// Mascot tuning constants.
//
// Deliberately NOT user settings. These are product decisions about pacing and
// personality, not preferences — exposing them in Profile would invite users to
// turn the character into either wallpaper or a nuisance. They live here, in one
// file, so there's a single place to open when we want to retune. See the
// "Tuning Constants" section of README.md.
//
// The four variability axes, and what scopes each one:
//   colour  (sari + veena wood) — fixed for a whole session
//   motion  (idle loop set)     — fixed for a whole session
//   action  (gestures)          — random per trigger, orthogonal to emotion
//   emotion                     — deterministic from quiz progress
// Only emotion carries information about how the user is doing. Everything else
// is decoration, and keeping actions orthogonal to emotion is intentional: the
// odd combination (plucking cheerfully while scowling) is the charm, not a bug.

import type { MascotGesture } from './useMascotRig';

export const MASCOT_CONFIG = {
  /** Probability that a given quiz session gets a mascot at all. Rolled ONCE at
   *  session start, not per question: colour is session-scoped, so a per-question
   *  roll would make her flicker in and out wearing different saris. Rarity is
   *  the point — she should feel like an event, not furniture. */
  sessionAppearanceChance: 0.33,

  // ── Stage size ───────────────────────────────────────────────────────────
  // Her band sits outside the quiz's scrolling area, so she can never be
  // displaced by the card growing on answer. But every pixel she takes comes
  // straight out of the space the question gets, and an answered card that
  // doesn't fit pushes the Next button below the fold.
  //
  // Measured against the answered card (the tall state), which needs ~463px
  // including container padding:
  //   390x844 phone -> 599px of scroller -> up to 240px of band before scrolling
  //   375x667 phone -> 422px of scroller -> only  63px
  // So the band has to scale with viewport height; a single fixed value either
  // wastes space on big screens or breaks small ones.

  /** Band height = viewportHeight - this. Derived from the measurements above:
   *  both data points land on `available ≈ height - 604`, and we keep ~36px of
   *  slack on top of that for taller cards (long meanings wrap, syntax tiles). */
  viewportReservePx: 640,

  /** Never grow past this, however tall the screen. Beyond roughly this size she
   *  stops reading as a companion to the question and starts competing with it. */
  maxStageHeightPx: 208,

  /** Below this she'd be a squashed sliver, and the space is better given back
   *  to the question — so she is skipped entirely rather than shrunk. On a
   *  375x667 phone this is what keeps the Next button above the fold. */
  minStageHeightPx: 84,

  /** How much taller the card gets once an answer is revealed (feedback alert +
   *  the Known/skip/Next row). While the question is unanswered we size her
   *  against `content + this`, so she is already small enough for the answered
   *  state and never has to shrink or vanish mid-question. */
  answeredGrowthPx: 152,

  /** Nudge left of centre, because the streak badge floats above the centre of
   *  the navbar directly below her. The badge is nudged right by the same
   *  amount in `Navbar.tsx` — keep the two in sync. */
  horizontalOffsetPx: 72,

  /** Random wait between ambient idle gestures while the user is thinking.
   *  Long enough that she reads as calm rather than fidgety. */
  idleGestureIntervalMs: [6000, 12000] as [number, number],

  /** Gestures she may perform unprompted while a question is on screen. Small
   *  ones only — a hop while you're reading is a distraction. */
  idleGestures: ['wobble', 'nod', 'pluck'] as MascotGesture[],

  /** Gestures fired on answering. Picked at random regardless of right/wrong. */
  reactionGestures: ['wobble', 'nod', 'shake', 'hop', 'pluck'] as MascotGesture[],

  /** How long she holds the reaction face before settling back to the baseline
   *  emotion derived from session accuracy. */
  reactionHoldMs: 2200,

  /** Dwell time on a question before she shifts to the `thinking` pose. Used
   *  sparingly: a permanently pensive character stops meaning anything. */
  thinkingAfterMs: 8000,

  /** Session accuracy thresholds for the between-questions baseline emotion.
   *  Deterministic: the same answers always produce the same face. */
  emotion: {
    /** accuracy >= this -> happy */
    happyAtOrAbove: 0.8,
    /** accuracy < this -> sad. Between the two -> neutral idle. */
    sadBelow: 0.5,
    /** Questions answered before accuracy is trusted. One wrong answer out of
     *  one shouldn't make her miserable. */
    minAnswersForBaseline: 3,
  },
} as const;
