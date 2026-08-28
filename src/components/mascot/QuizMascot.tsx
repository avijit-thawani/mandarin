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
import { useMascotRig, pickBySeed } from './useMascotRig';
import { SARAS_PALETTES, VEENA_TONES } from './sarasPalettes';
import { MASCOT_CONFIG, type MascotReaction } from './mascotConfig';
import { stageHeightFor } from './mascotVisibility';

/** Pick from a weighted table. Weights are relative, so tables can be retuned
 *  by editing one number without rebalancing the rest. */
function pickWeighted(table: MascotReaction[]): MascotReaction {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

/** Band height, derived from the viewport and nothing else.
 *
 *  An earlier version measured the quiz card and shrank the band to whatever
 *  the card left over. It was correct per question and wrong as an experience:
 *  cards differ in height (a wrapped meaning, a trivia card, a syntax exercise
 *  with its tile grid), so she changed size as the session went along, and on
 *  the tall syntax cards the leftover fell under `minStageHeightPx` and she
 *  disappeared for the rest of the quiz. A per-session shrink ratchet made that
 *  permanent rather than fixing it.
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
  // the URL bar collapses and expands. Quantising to a step and ignoring small
  // deltas keeps that jitter from becoming visible breathing; a real rotation
  // clears the threshold easily.
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
  /** Session finished — the one place a held expression makes sense. */
  complete?: boolean;
}

export function QuizMascot({
  sessionSeed,
  answerNonce,
  lastCorrect,
  complete = false,
}: QuizMascotProps) {
  const { containerRef, setExpression, playGesture } = useMascotRig({ seed: sessionSeed });
  const reactingUntil = useRef(0);
  const stageHeight = useStageHeight();

  const palette = pickBySeed(SARAS_PALETTES, sessionSeed);
  // Salted separately so the wood tone varies independently of the sari.
  const veenaTone = pickBySeed(VEENA_TONES, sessionSeed + ':veena');

  // Answer streaks pick which reaction table to draw from: a first slip gets
  // sympathy, a second in a row earns irritation, and a run of correct answers
  // unlocks the livelier responses.
  const streakRef = useRef({ correct: 0, wrong: 0 });
  useEffect(() => {
    streakRef.current = { correct: 0, wrong: 0 };
  }, [sessionSeed]);

  // React to an answer, then return to idle. Her resting face is always idle —
  // performance is expressed in the moment of answering, not held on her face.
  useEffect(() => {
    if (answerNonce === 0) return;

    const streak = streakRef.current;
    if (lastCorrect) {
      streak.correct += 1;
      streak.wrong = 0;
    } else {
      streak.wrong += 1;
      streak.correct = 0;
    }

    const { reactions, celebrateAtStreak, streakTableChance, escalateWrongAt } = MASCOT_CONFIG;
    const onStreak = streak.correct >= celebrateAtStreak && Math.random() < streakTableChance;
    const table = lastCorrect
      ? onStreak
        ? reactions.correctStreak
        : reactions.correct
      : streak.wrong >= escalateWrongAt
        ? reactions.wrongRepeat
        : reactions.wrongFirst;

    const reaction = pickWeighted(table);
    setExpression(reaction.expression);
    const timers = reaction.gestures.map((gesture, i) =>
      setTimeout(() => playGesture(gesture), i * MASCOT_CONFIG.gestureStaggerMs),
    );

    reactingUntil.current = Date.now() + MASCOT_CONFIG.reactionHoldMs;
    const settle = setTimeout(() => setExpression('idle'), MASCOT_CONFIG.reactionHoldMs);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerNonce]);

  // The results screen is the one place a held expression makes sense.
  useEffect(() => {
    if (complete) setExpression('celebrate');
  }, [complete, setExpression]);

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
