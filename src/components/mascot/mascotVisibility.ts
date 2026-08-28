// Whether Saras appears, and how much room her band gets.
//
// Split out of QuizMascot.tsx so that file exports only its component: mixing
// component and non-component exports breaks React Fast Refresh.

import { MASCOT_CONFIG } from './mascotConfig';
import { hashSeed } from './useMascotRig';

/** Deterministic roll for a session, so re-renders and remounts can't change
 *  their mind about whether she's here. */
export function mascotAppearsForSession(sessionSeed: string): boolean {
  const roll = (hashSeed(sessionSeed + ':appearance') % 10000) / 10000;
  return roll < MASCOT_CONFIG.sessionAppearanceChance;
}

/** Upper bound on her band from viewport height alone, before the actual card
 *  is measured. Returns 0 when the screen is too short to be worth it. */
export function stageHeightFor(viewportHeight: number): number {
  const available = viewportHeight - MASCOT_CONFIG.viewportReservePx;
  if (available < MASCOT_CONFIG.minStageHeightPx) return 0;
  return Math.min(available, MASCOT_CONFIG.maxStageHeightPx);
}
