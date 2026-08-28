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

import type { MascotExpression, MascotGesture } from './useMascotRig';

/** One possible reaction: how likely it is, the face, and the gestures to play
 *  (in order, staggered). */
export interface MascotReaction {
  weight: number;
  expression: MascotExpression;
  gestures: MascotGesture[];
}

export const MASCOT_CONFIG = {
  /** Probability that a given quiz session gets a mascot at all. Rolled ONCE at
   *  session start, not per question: colour is session-scoped, so a per-question
   *  roll would make her flicker in and out wearing different saris. Rarity is
   *  the point — she should feel like an event, not furniture. */
  sessionAppearanceChance: 0.33,

  // ── Stage size ───────────────────────────────────────────────────────────
  // Her band sits outside the quiz's scrolling area, so she can never be
  // displaced by the card growing on answer. Its height depends on the viewport
  // and NOTHING else: it is fixed before the first question and held for the
  // whole session. Measuring the card instead (an earlier version did) sized
  // each question correctly but made her grow and shrink through the session,
  // and let the tall syntax cards squeeze her out of existence entirely.
  //
  // Measured against the answered card (the tall state), which needs ~463px
  // including container padding:
  //   390x844 phone -> 599px of scroller -> up to 240px of band before scrolling
  //   375x667 phone -> 422px of scroller -> only  63px
  // So the band still has to scale with viewport height; a single fixed value
  // either wastes space on big screens or breaks small ones. Cards taller than
  // the remainder (syntax exercises, wrapped meanings) scroll in their own
  // container, which is the deliberate trade for holding still.

  /** Band height = viewportHeight - this. Derived from the measurements above:
   *  both data points land on `available ≈ height - 604`, plus slack for the
   *  taller card types so they usually still fit without scrolling. */
  viewportReservePx: 680,

  /** Never grow past this, however tall the screen. Beyond roughly this size she
   *  stops reading as a companion to the question and starts competing with it. */
  maxStageHeightPx: 200,

  /** Below this she'd be a squashed sliver, and the space is better given back
   *  to the question — so she is skipped entirely rather than shrunk. On a
   *  375x667 phone this is what keeps the Next button above the fold. */
  minStageHeightPx: 84,

  /** Ignore viewport changes smaller than this. Mobile browsers resize the
   *  viewport constantly as the URL bar collapses; without a threshold that
   *  jitter shows up as the character quietly breathing in and out. */
  resizeThresholdPx: 24,

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

  /** How long she holds the reaction face before returning to idle. */
  reactionHoldMs: 2200,

  /** Gap between gestures when a reaction plays more than one. */
  gestureStaggerMs: 260,

  // ── Reactions ────────────────────────────────────────────────────────────
  // Weighted tables rather than one fixed response per outcome. A learner
  // answers correctly 80%+ of the time, so a single "correct" animation is seen
  // hundreds of times a week and goes stale fast. Most entries are deliberately
  // understated — `idle` with a small gesture — because a big grin after every
  // routine answer is what made her feel like she was flipping between moods.
  // Weights are relative within a table; they need not sum to anything.

  /** Consecutive correct answers before the livelier table becomes available. */
  celebrateAtStreak: 5,
  /** ...and even then it's only used this often. Without this, a good learner
   *  sits above the threshold almost permanently (at 80% accuracy the streak
   *  table fired on 40% of answers), so the "special" reaction stopped being
   *  special. Simulated spread at 80%: ~56% idle, ~25% happy, ~4% celebrate. */
  streakTableChance: 0.4,
  /** Consecutive wrong answers before she gets properly annoyed. */
  escalateWrongAt: 2,

  reactions: {
    /** The common case. Mostly idle + a small acknowledgement. */
    correct: [
      { weight: 34, expression: 'idle', gestures: ['nod'] },
      { weight: 22, expression: 'idle', gestures: ['wobble'] },
      { weight: 14, expression: 'idle', gestures: ['nod', 'pluck'] },
      { weight: 14, expression: 'happy', gestures: ['wobble'] },
      { weight: 10, expression: 'happy', gestures: ['pluck'] },
      { weight: 6, expression: 'happy', gestures: ['nod', 'pluck'] },
    ] as MascotReaction[],

    /** On a run of correct answers — livelier, and the only place the hop lives. */
    correctStreak: [
      { weight: 25, expression: 'happy', gestures: ['wobble', 'pluck'] },
      { weight: 20, expression: 'celebrate', gestures: ['hop', 'pluck'] },
      { weight: 20, expression: 'happy', gestures: ['nod', 'pluck'] },
      { weight: 20, expression: 'idle', gestures: ['wobble', 'pluck'] },
      { weight: 15, expression: 'celebrate', gestures: ['wobble'] },
    ] as MascotReaction[],

    /** First slip. Sympathetic rather than cross — one mistake isn't a crime. */
    wrongFirst: [
      { weight: 32, expression: 'idle', gestures: ['shake'] },
      { weight: 28, expression: 'sad', gestures: ['shake'] },
      { weight: 20, expression: 'thinking', gestures: ['shake'] },
      { weight: 12, expression: 'sad', gestures: ['nod'] },
      { weight: 8, expression: 'angry', gestures: ['shake'] },
    ] as MascotReaction[],

    /** Repeated slips — now she's allowed to be annoyed. */
    wrongRepeat: [
      { weight: 40, expression: 'angry', gestures: ['shake'] },
      { weight: 25, expression: 'sad', gestures: ['shake'] },
      { weight: 20, expression: 'angry', gestures: ['shake', 'nod'] },
      { weight: 15, expression: 'thinking', gestures: ['wobble'] },
    ] as MascotReaction[],
  },

  /** Dwell time on a question before she shifts to the `thinking` pose. Used
   *  sparingly: a permanently pensive character stops meaning anything. */
  thinkingAfterMs: 8000,

  // Her resting face is plain `idle`, always. An earlier version derived it from
  // session accuracy (happy above 80%, sad below 50%), which sounded principled
  // but read badly: learners are correct 80%+ of the time, so she sat in a fixed
  // grin and visibly changed mood whenever the running average crossed a line.
  // Performance is expressed in the *moment* of answering instead — that's what
  // the weighted reaction tables above are for.
} as const;
