// Mascot rig: procedural idle motion + expressions + gestures.
//
// Modelled on the "modular actor" idea Duolingo describes for their Rive
// characters: rather than authoring one animation per reaction, you give each
// body part a small pool of loops and let combinations do the work. They ship 8
// head x 8 body animations to get 64+ neutral movements and avoid a visibly
// repeating idle. Here the pools multiply out to 324 idle combinations before
// timing jitter, x8 palettes.
//
// Driven with the Web Animations API rather than CSS keyframes because we need
// runtime-computed values (per-instance durations and phase offsets) and real
// playback control. Note WAAPI defaults to `linear` easing, which reads
// robotic — every timing below sets an easing explicitly.

import { useEffect, useRef, useCallback } from 'react';
import { MASCOT_PALETTES, type MascotPalette } from './palettes';

export type MascotExpression = 'idle' | 'happy' | 'sad' | 'angry' | 'thinking' | 'celebrate';
export type MascotGesture = 'nod' | 'shake' | 'wobble' | 'hop' | 'wave' | 'pluck';

// Easing vocabulary. WAAPI defaults to `linear`, which is what makes naive
// JS animation look robotic, so nothing below is left at the default.
const EASE = {
  /** Overshoots and settles — the difference between "moved" and "sprang". */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Slow out/in, for breathing and other looping motion. */
  soft: 'ease-in-out',
  /** Fast start, for reactions that should feel instant. */
  snap: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

/** How far behind the body a trailing part lags, in ms. Hair and cloth arriving
 *  a beat late is the single cheapest trick for making a rig feel physical. */
const FOLLOW_THROUGH_LAG = 160;

// ── deterministic randomness ────────────────────────────────────────────────
// Seeding off the vocabulary word means the same word always gets the same
// character. Random-per-render would read as noise; stable reads as "this word
// has a personality".

/** Exposed so callers can derive their own deterministic rolls from a seed. */
export function hashSeed(s: string): number {
  return hashString(s);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministically pick from a list for a given seed. Exported so other
 *  character kinds (with their own palettes) stay in sync with the rig's choice. */
export function pickBySeed<T>(items: T[], seed: string): T {
  return items[hashString(seed) % items.length];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Keyframes = Keyframe[];
interface Loop {
  name: string;
  frames: Keyframes;
  duration: [number, number]; // min/max ms, jittered per instance
}

// ── behaviour pools ─────────────────────────────────────────────────────────

const BODY_LOOPS: Loop[] = [
  { name: 'breathe', frames: [{ transform: 'scale(1,1)' }, { transform: 'scale(1.03,0.97)' }], duration: [2200, 3200] },
  { name: 'sway', frames: [{ transform: 'translateX(-2px) rotate(-1.5deg)' }, { transform: 'translateX(2px) rotate(1.5deg)' }], duration: [2600, 3800] },
  { name: 'bounce', frames: [{ transform: 'translateY(0px)' }, { transform: 'translateY(-4px)' }], duration: [1600, 2400] },
  { name: 'tilt', frames: [{ transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2.5deg)' }], duration: [3000, 4200] },
  { name: 'pulse', frames: [{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }], duration: [1800, 2600] },
  { name: 'drift', frames: [{ transform: 'translate(-1.5px, 0px)' }, { transform: 'translate(1.5px, -3px)' }], duration: [2800, 4000] },
];

const HEAD_LOOPS: Loop[] = [
  { name: 'nod', frames: [{ transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }], duration: [2400, 3400] },
  { name: 'peer', frames: [{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }], duration: [3200, 4600] },
  { name: 'bobble', frames: [{ transform: 'translateY(0px)' }, { transform: 'translateY(-2.5px)' }], duration: [1400, 2000] },
  { name: 'cock', frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0deg)' }], duration: [3600, 5200] },
  // A deliberately still head. Contrast is what stops a crowd of these looking
  // like they're all doing the same dance.
  { name: 'still', frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(0deg)' }], duration: [4000, 4000] },
  { name: 'roam', frames: [{ transform: 'translate(-2px,-1px)' }, { transform: 'translate(2px,1px)' }], duration: [3000, 4400] },
];

const ARM_LOOPS: Loop[] = [
  { name: 'flap', frames: [{ transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }], duration: [1800, 2600] },
  { name: 'hang', frames: [{ transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }], duration: [3000, 4200] },
  { name: 'perky', frames: [{ transform: 'rotate(4deg) translateY(-2px)' }, { transform: 'rotate(-4deg) translateY(0px)' }], duration: [1400, 2000] },
];

const BLINK_STYLES = [
  { name: 'calm', gap: [3200, 6000] as [number, number], double: false },
  { name: 'quick', gap: [1800, 3600] as [number, number], double: false },
  { name: 'double', gap: [3000, 5200] as [number, number], double: true },
];

export interface MascotVariant {
  palette: MascotPalette;
  body: string;
  head: string;
  arms: string;
  blink: string;
  blush: boolean;
}

/** Distinct motion sets, independent of colour. */
export const MOTION_COMBINATIONS =
  BODY_LOOPS.length * HEAD_LOOPS.length * ARM_LOOPS.length * BLINK_STYLES.length;

/** How many distinct idles the creature can produce, for the demo UI to report. */
export const VARIANT_COUNT = MOTION_COMBINATIONS * MASCOT_PALETTES.length;

function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.classList.contains('reduce-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

// Brow rotation signs are the whole game here. SVG rotate is clockwise, and
// browL sits on the viewer's left:
//   angry — inner ends (toward the nose) drop: browL clockwise, browR counter
//   sad   — outer ends drop: the exact opposite
// `mouth: scaleY(-1)` flips the smile arc into a frown about its own centre.
const EXPRESSION_POSES: Record<MascotExpression, Record<string, string>> = {
  idle: {},
  // Eyes only *partly* close: with the mouth open, a hard squint reads as a
  // wince. The laugh comes from the mouth, not from shutting the eyes.
  happy: { head: 'translateY(-3px)', eyeL: 'scaleY(0.7)', eyeR: 'scaleY(0.7)', mouthOpen: 'scale(1)' },
  sad: {
    head: 'translateY(3px)',
    eyeL: 'scaleY(0.8)',
    eyeR: 'scaleY(0.8)',
    browL: 'rotate(-14deg) translateY(2px)',
    browR: 'rotate(14deg) translateY(2px)',
    mouth: 'scaleY(-1) translateY(1px)',
  },
  angry: {
    // Head pushes down and forward — the body language matters as much as the face.
    head: 'translateY(2px) scale(1.02)',
    eyeL: 'scaleY(0.75)',
    eyeR: 'scaleY(0.75)',
    browL: 'rotate(16deg) translateY(3px)',
    browR: 'rotate(-16deg) translateY(3px)',
    mouth: 'scaleY(-1)',
  },
  thinking: { head: 'rotate(-6deg)', pupils: 'translate(4px,-4px)' },
  celebrate: { head: 'translateY(-5px)', eyeL: 'scaleY(0.6)', eyeR: 'scaleY(0.6)', mouthOpen: 'scale(1.15)' },
};

/** Expressions that need the brows visible. */
const BROW_EXPRESSIONS: MascotExpression[] = ['sad', 'angry'];

/** Expressions that swap the closed smile for the open, laughing mouth. */
const LAUGH_EXPRESSIONS: MascotExpression[] = ['happy', 'celebrate'];

interface UseMascotRigOptions {
  /** Anything stable — a vocabulary word, a question id. Same seed, same character. */
  seed?: string;
  /** Force a palette instead of deriving it from the seed. */
  paletteId?: string;
}

export function useMascotRig({ seed = 'default', paletteId }: UseMascotRigOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const idleAnims = useRef<Animation[]>([]);
  const exprAnims = useRef<Animation[]>([]);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expression = useRef<MascotExpression>('idle');

  const variant = useRef<MascotVariant>(null as unknown as MascotVariant);
  if (!variant.current) {
    const rand = mulberry32(hashString(seed));
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    variant.current = {
      palette: paletteId
        ? MASCOT_PALETTES.find(p => p.id === paletteId) ?? MASCOT_PALETTES[0]
        : pick(MASCOT_PALETTES),
      body: pick(BODY_LOOPS).name,
      head: pick(HEAD_LOOPS).name,
      arms: pick(ARM_LOOPS).name,
      blink: pick(BLINK_STYLES).name,
      blush: rand() > 0.35,
    };
  }

  const slot = useCallback((name: string): SVGElement | null => {
    return containerRef.current?.querySelector<SVGElement>(`[data-slot="${name}"]`) ?? null;
  }, []);

  const scheduleBlink = useCallback(() => {
    const style = BLINK_STYLES.find(b => b.name === variant.current.blink) ?? BLINK_STYLES[0];
    const rand = Math.random();
    const delay = style.gap[0] + rand * (style.gap[1] - style.gap[0]);
    blinkTimer.current = setTimeout(() => {
      // Don't blink over a squinting expression — it reads as a glitch.
      if (expression.current === 'idle' || expression.current === 'thinking') {
        const frames: Keyframes = style.double
          ? [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }]
          : [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }];
        for (const eye of ['eyeL', 'eyeR']) {
          slot(eye)?.animate(frames, { duration: style.double ? 420 : 180, easing: 'ease-in-out' });
        }
      }
      scheduleBlink();
    }, delay);
  }, [slot]);

  const startIdle = useCallback(() => {
    if (prefersReducedMotion()) return;
    const v = variant.current;
    const rand = mulberry32(hashString(seed + ':timing'));
    const jitter = (range: [number, number]) => range[0] + rand() * (range[1] - range[0]);

    const bind = (slotName: string, loop: Loop | undefined, extra: KeyframeAnimationOptions = {}) => {
      const el = slot(slotName);
      if (!el || !loop) return;
      const anim = el.animate(loop.frames, {
        duration: jitter(loop.duration),
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out',
        ...extra,
      });
      idleAnims.current.push(anim);
    };

    const bodyLoop = BODY_LOOPS.find(l => l.name === v.body);
    bind('body', bodyLoop);
    bind('head', HEAD_LOOPS.find(l => l.name === v.head));

    // Follow-through: hair/cloth runs the body's own motion, delayed and
    // slightly exaggerated, so it trails the body instead of moving with it.
    if (bodyLoop) {
      bind(
        'hair',
        { ...bodyLoop, frames: bodyLoop.frames.map(f => ({ ...f })) },
        { delay: FOLLOW_THROUGH_LAG, easing: EASE.soft },
      );
    }

    // Arms share a loop but run out of phase, so they never look mechanically paired.
    const armLoop = ARM_LOOPS.find(l => l.name === v.arms);
    bind('armL', armLoop);
    bind('armR', armLoop, { delay: -jitter([300, 900]) });
    bind('feet', { name: 'feet', frames: [{ transform: 'translateY(0px)' }, { transform: 'translateY(-3px)' }], duration: [1200, 1900] }, { delay: -400 });

    // Character-specific parts. Absent slots are simply skipped, so the same rig
    // drives both the creature and Saras.
    bind('veena', { name: 'veena', frames: [{ transform: 'rotate(-0.8deg)' }, { transform: 'rotate(0.8deg)' }], duration: [2600, 3600] }, { delay: FOLLOW_THROUGH_LAG });

    // The shadow shrinking as the body rises is what sells the float.
    bind('shadow', { name: 'shadow', frames: [{ transform: 'scaleX(1)', opacity: 0.16 }, { transform: 'scaleX(0.92)', opacity: 0.12 }], duration: [1600, 2400] });

    scheduleBlink();
  }, [seed, slot, scheduleBlink]);

  const stopIdle = useCallback(() => {
    idleAnims.current.forEach(a => a.cancel());
    idleAnims.current = [];
    if (blinkTimer.current) clearTimeout(blinkTimer.current);
  }, []);

  useEffect(() => {
    startIdle();
    return stopIdle;
  }, [startIdle, stopIdle]);

  const setExpression = useCallback(
    (next: MascotExpression) => {
      expression.current = next;
      const pose = EXPRESSION_POSES[next];

      // Each pose is a forwards-filled additive animation, so the previous one
      // has to be cancelled or the transforms stack: happy -> sad -> happy would
      // drift the head further down every cycle instead of returning.
      exprAnims.current.forEach(a => a.cancel());
      exprAnims.current = [];

      for (const name of ['head', 'eyeL', 'eyeR', 'pupils', 'browL', 'browR', 'mouth', 'mouthOpen']) {
        const el = slot(name);
        if (!el) continue;
        const target = pose[name];
        exprAnims.current.push(
          el.animate(
            [{ transform: target ?? 'none' }],
            { duration: prefersReducedMotion() ? 0 : 260, easing: EASE.spring, fill: 'forwards', composite: 'add' },
          ),
        );
      }
      const brows = slot('brows');
      brows?.animate([{ opacity: BROW_EXPRESSIONS.includes(next) ? 1 : 0 }], {
        duration: 200,
        fill: 'forwards',
      });

      // Cross-fade the closed smile against the open laughing mouth. Tracked in
      // exprAnims too, or the opacity would stack the same way transforms did.
      const laughing = LAUGH_EXPRESSIONS.includes(next);
      const fade = (name: string, to: number) => {
        const el = slot(name);
        if (!el) return;
        exprAnims.current.push(el.animate([{ opacity: to }], { duration: 180, fill: 'forwards' }));
      };
      fade('mouth', laughing ? 0 : 1);
      fade('mouthOpen', laughing ? 1 : 0);
    },
    [slot],
  );

  const playGesture = useCallback(
    (gesture: MascotGesture) => {
      if (prefersReducedMotion()) return;

      // Each gesture is a list of (slot, keyframes, timing) so one gesture can
      // move several parts with independent delays — that stagger is what makes
      // a movement read as a body rather than a sprite.
      type Step = {
        slot: string;
        frames: Keyframes;
        duration: number;
        delay?: number;
        easing?: string;
        /** Steps on slots with no idle loop (the notes) replace rather than add. */
        composite?: CompositeOperation;
      };
      const spec: Record<MascotGesture, Step[]> = {
        // Yes: pitch, i.e. the chin drops and comes back. In flat 2D there's no
        // axis to pitch around, so it's a vertical translate with a touch of
        // vertical squash for weight. Rotating here reads as a head tilt, not a nod.
        nod: [
          {
            slot: 'head',
            frames: [
              { transform: 'translateY(0px) scaleY(1)' },
              { transform: 'translateY(3px) scaleY(0.985)', offset: 0.35 },
              { transform: 'translateY(-1px) scaleY(1.005)', offset: 0.7 },
              { transform: 'translateY(0px) scaleY(1)' },
            ],
            duration: 520,
            easing: EASE.spring,
          },
          { slot: 'hair', frames: [{ transform: 'translateY(0px)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0px)' }], duration: 580, delay: 80, easing: EASE.spring },
        ],
        // No: yaw, faked as a horizontal translate. The small counter-rotation
        // stops it looking like the head is sliding on rails.
        shake: [
          {
            slot: 'head',
            frames: [
              { transform: 'translateX(0px) rotate(0deg)' },
              { transform: 'translateX(-3.5px) rotate(-1deg)' },
              { transform: 'translateX(3.5px) rotate(1deg)' },
              { transform: 'translateX(-2px) rotate(-0.5deg)' },
              { transform: 'translateX(0px) rotate(0deg)' },
            ],
            duration: 460,
            easing: EASE.snap,
          },
          { slot: 'hair', frames: [{ transform: 'translateX(0px)' }, { transform: 'translateX(-2.5px)' }, { transform: 'translateX(2.5px)' }, { transform: 'translateX(0px)' }], duration: 520, delay: 70, easing: EASE.snap },
        ],
        // The Indian head wobble: a lateral tilt that rocks side to side and
        // damps out. It's a roll, not a yaw — the head pivots at the neck while
        // the crown swings, so it's rotation paired with a small opposing shift.
        // Decaying amplitude is what makes it read as a wobble rather than a
        // metronome, and it wants to be slower and smoother than a "no" shake.
        wobble: [
          {
            slot: 'head',
            frames: [
              { transform: 'rotate(0deg) translateX(0px)' },
              { transform: 'rotate(-8deg) translateX(2px)', offset: 0.2 },
              { transform: 'rotate(7deg) translateX(-2px)', offset: 0.45 },
              { transform: 'rotate(-5deg) translateX(1px)', offset: 0.68 },
              { transform: 'rotate(3deg) translateX(-1px)', offset: 0.86 },
              { transform: 'rotate(0deg) translateX(0px)' },
            ],
            duration: 950,
            easing: EASE.soft,
          },
          {
            slot: 'hair',
            frames: [
              { transform: 'rotate(0deg)' },
              { transform: 'rotate(-6deg)', offset: 0.2 },
              { transform: 'rotate(5deg)', offset: 0.45 },
              { transform: 'rotate(-3deg)', offset: 0.68 },
              { transform: 'rotate(0deg)' },
            ],
            duration: 1050,
            delay: 110,
            easing: EASE.soft,
          },
        ],
        hop: [
          // Anticipation (squash) → launch (stretch) → land (squash) → settle.
          // Squash and stretch is what separates a jump from a translate.
          // Amplitude kept small: she's seated cross-legged with a four-foot
          // instrument in her lap, so a big jump reads as levitation.
          {
            slot: 'root',
            frames: [
              { transform: 'translateY(0px) scale(1,1)' },
              { transform: 'translateY(2px) scale(1.03,0.97)', offset: 0.15 },
              { transform: 'translateY(-9px) scale(0.98,1.03)', offset: 0.5 },
              { transform: 'translateY(0px) scale(1.02,0.98)', offset: 0.8 },
              { transform: 'translateY(0px) scale(1,1)' },
            ],
            duration: 620,
            easing: EASE.spring,
          },
          { slot: 'hair', frames: [{ transform: 'translateY(0px)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0px)' }], duration: 680, delay: 90, easing: EASE.spring },
          { slot: 'shadow', frames: [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.85)', offset: 0.5 }, { transform: 'scaleX(1)' }], duration: 620, easing: EASE.spring },
        ],
        wave: [
          { slot: 'armR', frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-38deg)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(-38deg)' }, { transform: 'rotate(0deg)' }], duration: 780, easing: EASE.soft },
        ],
        // Saras-specific: pluck the strings. Hand strikes, strings ring, head
        // dips into the phrase the way players actually move.
        pluck: [
          { slot: 'armR', frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-13deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0deg)' }], duration: 520, easing: EASE.spring },
          { slot: 'hand', frames: [{ transform: 'translate(0px,0px)' }, { transform: 'translate(-3px,-4px)' }, { transform: 'translate(0px,0px)' }], duration: 520, easing: EASE.spring },
          { slot: 'strings', frames: [{ transform: 'translateY(0px)' }, { transform: 'translateY(-1.6px)' }, { transform: 'translateY(1.4px)' }, { transform: 'translateY(-0.8px)' }, { transform: 'translateY(0px)' }], duration: 460, delay: 120, easing: 'linear' },
          { slot: 'veena', frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-1.4deg)' }, { transform: 'rotate(0deg)' }], duration: 620, delay: 100, easing: EASE.soft },
          { slot: 'head', frames: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0deg)' }], duration: 700, delay: 60, easing: EASE.soft },
          // Notes drift up and fade as the string rings.
          {
            slot: 'notes',
            frames: [
              { opacity: 0, transform: 'translateY(6px)' },
              { opacity: 1, transform: 'translateY(-4px)', offset: 0.3 },
              { opacity: 0, transform: 'translateY(-22px)' },
            ],
            duration: 1100,
            delay: 120,
            easing: EASE.soft,
            composite: 'replace',
          },
        ],
      };

      for (const step of spec[gesture]) {
        // `composite: 'add'` layers the gesture on top of the running idle loop
        // instead of replacing it, so the character keeps breathing while it nods.
        slot(step.slot)?.animate(step.frames, {
          duration: step.duration,
          delay: step.delay ?? 0,
          easing: step.easing ?? EASE.snap,
          composite: step.composite ?? 'add',
        });
      }
    },
    [slot],
  );

  /** Convenience for quiz events. */
  const react = useCallback(
    (outcome: 'correct' | 'wrong') => {
      if (outcome === 'correct') {
        setExpression('happy');
        // The head wobble rather than a hop: it reads as approval, it suits a
        // seated player, and it doesn't launch her off the ground ten times a
        // session. Swap back to 'hop' if you want the bouncier read.
        playGesture('wobble');
        // A flourish on the instrument, overlapping the wobble.
        // No-ops on characters without an instrument.
        setTimeout(() => playGesture('pluck'), 240);
      } else {
        // Angry rather than sad: brows down reads as "that's not right" at a
        // glance, where a droop reads as ambiguous at small sizes.
        setExpression('angry');
        playGesture('shake');
      }
    },
    [setExpression, playGesture],
  );

  return { containerRef, variant: variant.current, setExpression, playGesture, react };
}
