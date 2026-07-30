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

import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Band height that always leaves the quiz card enough room.
 *
 *  A height derived from the viewport alone is guesswork: it has to assume a
 *  card height, and the assumption breaks the moment a themed-review banner
 *  appears, an option's meaning wraps to two lines, or a syntax exercise shows
 *  up. Getting that wrong pushes the Next button below the fold.
 *
 *  So the band is measured instead. The scroll area's `scrollHeight` is the
 *  card's true height and doesn't depend on how tall the band is, so:
 *      total  = scroller.clientHeight + band          (invariant)
 *      band  <= total - contentHeight                 (no scrolling)
 *  which converges in a single pass. She yields space to the card rather than
 *  the card yielding to her — and because she sits *below* everything, resizing
 *  her never moves the question or the options.
 */
function useStageHeight(
  scrollAreaRef: React.RefObject<HTMLElement | null>,
  /** Changes whenever the card's content might have changed size. */
  contentKey: unknown,
  /** True once the answer is revealed, i.e. the card is already at full height. */
  showingResult: boolean,
): number {
  const [height, setHeight] = useState(() =>
    typeof window === 'undefined' ? 0 : stageHeightFor(window.innerHeight),
  );
  const heightRef = useRef(height);
  heightRef.current = height;
  const showingResultRef = useRef(showingResult);
  showingResultRef.current = showingResult;

  const measure = useCallback(() => {
    const byViewport = stageHeightFor(window.innerHeight);
    const scroller = scrollAreaRef.current;
    let next = byViewport;
    const card = scroller?.firstElementChild;
    if (scroller && card) {
      const total = scroller.clientHeight + heightRef.current;
      // Measure the CARD, not `scrollHeight`. scrollHeight is clamped to at
      // least clientHeight, so whenever the card fits it reports the container's
      // size instead of the content's — which made this subtract the growth
      // reserve on every pass and collapse the band to zero.
      const style = getComputedStyle(scroller);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const contentHeight = card.getBoundingClientRect().height + padding;
      // Size against the card's *tallest* state, so she doesn't shrink or pop
      // out the moment feedback appears.
      const needed = contentHeight + (showingResultRef.current ? 0 : MASCOT_CONFIG.answeredGrowthPx);
      next = Math.min(byViewport, total - needed);
    }
    if (next < MASCOT_CONFIG.minStageHeightPx) next = 0;
    // Only commit real changes; 1px jitter would thrash the observer.
    if (Math.abs(next - heightRef.current) >= 2) setHeight(next);
  }, [scrollAreaRef]);

  useEffect(() => {
    measure();
    const scroller = scrollAreaRef.current;
    const ro = new ResizeObserver(measure);
    if (scroller) {
      ro.observe(scroller);
      if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [scrollAreaRef, measure]);

  // ResizeObserver is the right tool but its delivery is tied to rendering, so
  // it can be starved (background tabs, throttled frames). Answering is exactly
  // when the card grows, so re-measure explicitly off React state too — after a
  // frame, so the new layout has landed.
  useEffect(() => {
    // Twice: once on the next frame for the common case, once shortly after to
    // catch layout that settles late (fonts, the feedback block's slide-up).
    const frame = requestAnimationFrame(() => measure());
    const settle = setTimeout(measure, 220);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [contentKey, measure]);

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
  /** True once the answer is revealed on the current question. */
  showingResult?: boolean;
  /** The quiz's scrolling area, so her band can shrink to keep the card's
   *  Next button on screen. */
  scrollAreaRef: React.RefObject<HTMLElement | null>;
}

export function QuizMascot({
  sessionSeed,
  answerNonce,
  lastCorrect,
  accuracy,
  answered,
  complete = false,
  showingResult = false,
  scrollAreaRef,
}: QuizMascotProps) {
  const { containerRef, setExpression, playGesture } = useMascotRig({ seed: sessionSeed });
  const reactingUntil = useRef(0);
  // answerNonce covers the card growing on answer; `answered` covers moving to
  // the next question, when it shrinks back.
  const stageHeight = useStageHeight(
    scrollAreaRef,
    `${answerNonce}:${answered}:${complete}:${showingResult}`,
    showingResult,
  );

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
