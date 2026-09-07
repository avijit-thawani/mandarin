// Saras as she appears inside a quiz session.
//
// Driven entirely by props so QuizPage doesn't have to hold a ref or call
// imperative methods: bump `answerNonce` when an answer is committed and this
// component works out the reaction, the gesture and the emotion itself.
//
// Placement note: this renders in the dead space *below* the question card, in a
// fixed-height stage reserved from the first question onward. It must never
// change the layout of anything above it — the quiz is tuned to 0px shift on
// answer, and a character that grows into place would reintroduce the exact
// problem we removed.

import { useEffect, useRef, useState } from 'react';
import { Saras } from './Saras';
import { useMascotRig, pickBySeed, hashSeed } from './useMascotRig';
import { SARAS_PALETTES, VEENA_TONES } from './sarasPalettes';
import { MASCOT_CONFIG } from './mascotConfig';

/** Deterministic 0-1 roll for a session, so re-renders and remounts can't
 *  change their mind about whether she's here. */
export function mascotAppearsForSession(sessionSeed: string): boolean {
  const roll = (hashSeed(sessionSeed + ':appearance') % 10000) / 10000;
  return roll < MASCOT_CONFIG.sessionAppearanceChance;
}

/** Upper bound from viewport height alone, before the actual card is considered. */
export function stageHeightFor(viewportHeight: number): number {
  const available = viewportHeight - MASCOT_CONFIG.viewportReservePx;
  if (available < MASCOT_CONFIG.minStageHeightPx) return 0;
  return Math.min(available, MASCOT_CONFIG.maxStageHeightPx);
}

/** Band height, derived from the viewport and nothing else.
 *
 *  An earlier version measured the quiz card and shrank the band to whatever
 *  the card left over, re-measuring on every answer via a ResizeObserver. It
 *  was correct per question and wrong as an experience: cards differ in height
 *  (a wrapped meaning, a trivia card, a syntax exercise with its tile grid), so
 *  she changed size as the session went along, and on the tall cards the
 *  leftover fell under `minStageHeightPx` and she disappeared.
 *
 *  So the band is now a constant for a given viewport: one size, chosen before
 *  the first question, held for the whole session. A card taller than the space
 *  left simply scrolls in its own container — which is what the container is
 *  for, and a strictly better failure than a character who resizes under you or
 *  vanishes mid-session.
 */
function useStageHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === 'undefined' ? 0 : stageHeightFor(window.innerHeight),
  );

  // Only the viewport can change this, and on mobile it changes constantly as
  // the URL bar collapses and expands. Ignoring small deltas keeps that jitter
  // from becoming visible breathing; a real rotation clears the threshold
  // easily.
  useEffect(() => {
    const measure = () => {
      const next = stageHeightFor(window.innerHeight);
      setHeight(prev => (Math.abs(next - prev) >= MASCOT_CONFIG.resizeThresholdPx ? next : prev));
    };
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return height;
}

interface QuizMascotProps {
  /** Stable for the whole quiz. Fixes her sari, veena and motion set. */
  sessionSeed: string;
  /** Increment once per committed answer to trigger a reaction. */
  answerNonce: number;
  /** Whether the most recent answer was correct. */
  lastCorrect: boolean;
  /** Running session accuracy, 0-1, for the baseline emotion. */
  accuracy: number;
  /** Number of answers so far, so early questions don't swing the baseline. */
  answered: number;
  /** Session finished — hold a celebration instead of the baseline. */
  complete?: boolean;
}

export function QuizMascot({
  sessionSeed,
  answerNonce,
  lastCorrect,
  accuracy,
  answered,
  complete = false,
}: QuizMascotProps) {
  const { containerRef, setExpression, playGesture } = useMascotRig({ seed: sessionSeed });
  const reactingUntil = useRef(0);
  const stageHeight = useStageHeight();

  const palette = pickBySeed(SARAS_PALETTES, sessionSeed);
  // Salted separately so the wood tone varies independently of the sari.
  const veenaTone = pickBySeed(VEENA_TONES, sessionSeed + ':veena');

  /** Baseline face from progress. The only axis that encodes performance. */
  const baseline = () => {
    if (complete) return 'celebrate' as const;
    if (answered < MASCOT_CONFIG.emotion.minAnswersForBaseline) return 'idle' as const;
    if (accuracy >= MASCOT_CONFIG.emotion.happyAtOrAbove) return 'happy' as const;
    if (accuracy < MASCOT_CONFIG.emotion.sadBelow) return 'sad' as const;
    return 'idle' as const;
  };

  // React to an answer: immediate face + a random gesture, then settle back to
  // the progress baseline. The gesture pool is independent of correctness on
  // purpose, so you get the occasional cheerful pluck attached to a scowl.
  useEffect(() => {
    if (answerNonce === 0) return;
    setExpression(lastCorrect ? 'happy' : 'angry');
    playGesture(
      MASCOT_CONFIG.reactionGestures[Math.floor(Math.random() * MASCOT_CONFIG.reactionGestures.length)],
    );
    reactingUntil.current = Date.now() + MASCOT_CONFIG.reactionHoldMs;
    const t = setTimeout(() => setExpression(baseline()), MASCOT_CONFIG.reactionHoldMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerNonce]);

  // Settle to the baseline whenever progress changes and we're not mid-reaction.
  useEffect(() => {
    if (Date.now() < reactingUntil.current) return;
    setExpression(baseline());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accuracy, answered, complete]);

  // Ambient gestures while the user reads the question, so she's alive rather
  // than a sprite that only exists to judge the answer.
  useEffect(() => {
    if (complete) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const [lo, hi] = MASCOT_CONFIG.idleGestureIntervalMs;
      timer = setTimeout(() => {
        if (Date.now() >= reactingUntil.current) {
          const pool = MASCOT_CONFIG.idleGestures;
          playGesture(pool[Math.floor(Math.random() * pool.length)]);
        }
        schedule();
      }, lo + Math.random() * (hi - lo));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [complete, playGesture]);

  // Long dwell on a question -> she starts pondering along with you.
  useEffect(() => {
    if (complete) return;
    const t = setTimeout(() => {
      if (Date.now() >= reactingUntil.current) setExpression('thinking');
    }, MASCOT_CONFIG.thinkingAfterMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerNonce, complete]);

  // Short screens give the space back to the question instead of showing a
  // squashed sliver. Hooks above still run, so ordering stays stable.
  if (stageHeight === 0) return null;

  return (
    <div
      ref={containerRef}
      // Fixed-height band that sits OUTSIDE the quiz's scrolling area, so a card
      // that grows on answer scrolls within its own container and can never
      // displace her. Inside the scroll area, `mt-auto` held her steady only
      // until the content overflowed, at which point she slid down by the full
      // height of the revealed feedback.
      className="flex-shrink-0 flex items-end justify-center text-base-content pointer-events-none overflow-hidden"
      style={{
        height: stageHeight,
        // Shifts her left of centre by half this padding, clearing the streak
        // badge that floats above the middle of the navbar.
        paddingRight: MASCOT_CONFIG.horizontalOffsetPx * 2,
      }}
      aria-hidden
    >
      {/* h-full w-auto is load-bearing: an SVG with no size constraint stretches
          to the container's width (~512px here) and takes its height from the
          aspect ratio, blowing straight through the stage. */}
      <Saras palette={palette} veenaTone={veenaTone} className="h-full w-auto" />
    </div>
  );
}
