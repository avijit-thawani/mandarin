/**
 * Themed review selection: which themes can run, and whether this session gets one.
 *
 * A themed review narrows only the MCQ *word selection*. Two things deliberately stay
 * on the full known pool:
 *
 * 1. Distractors. Options drawn from 9 theme words would repeat across a session and
 *    become guessable, and same-category distractors are already the hard-mode signal
 *    (see selectDistractors in quiz.ts) — a themed session would otherwise make every
 *    question maximally confusable at once.
 * 2. Syntax exercises. They need a wide pool to satisfy templates; feeding them ~10
 *    words makes almost every template unavailable and silently degrades the session
 *    to all-MCQ (see checkSyntaxUnlock). Unrelated syntax questions inside a themed
 *    session are also the built-in variety that stops nine near-identical cards in a row.
 */

import type { Concept } from '../types/vocabulary';
import { REVIEW_THEMES, REVIEW_THEMES_BY_ID, type ReviewTheme } from '../data/reviewThemes';

/** Fraction of sessions that become a themed review in production. */
export const THEMED_REVIEW_CHANCE = 0.2;

/**
 * Absolute floor on theme size. Below this, a "theme" is a handful of words seen
 * repeatedly, which is a worse session than no theme at all.
 */
export const MIN_THEME_WORDS = 8;

/**
 * A theme must be able to fill a session without recycling words. Scales with the
 * cards-per-session setting (5-50) rather than assuming the default of 10.
 */
export function themeSizeThreshold(cardsPerSession: number): number {
  return Math.max(MIN_THEME_WORDS, Math.ceil(cardsPerSession * 0.8));
}

/** True on a dev machine, where themed reviews always fire so they can be tested. */
export function isLocalDev(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export interface ThemeCandidate {
  theme: ReviewTheme;
  words: Concept[];
}

/** The concepts from `pool` that belong to `theme`. */
export function themeMembers(theme: ReviewTheme, pool: Concept[]): Concept[] {
  const wanted = new Set(theme.words);
  return pool.filter((c) => wanted.has(c.word));
}

/**
 * Themes with enough of the user's known words to carry a session.
 *
 * Recomputed per user on every session rather than precomputed, because viability
 * depends entirely on which words the user has checked off, and that changes daily.
 */
export function viableThemes(pool: Concept[], cardsPerSession: number): ThemeCandidate[] {
  const threshold = themeSizeThreshold(cardsPerSession);
  return REVIEW_THEMES
    .map((theme) => ({ theme, words: themeMembers(theme, pool) }))
    .filter((c) => c.words.length >= threshold);
}

/**
 * Decide whether this session should be themed, and pick one.
 *
 * Rolled per session (not per day) so the surprise stays live — a user doing three
 * sessions gets three independent chances.
 *
 * Overrides, in order: `?reviewTheme=<id>` forces one specific theme (or `off` to
 * disable), then localhost forces a random theme so the feature is always visible
 * while developing.
 */
export function pickThemedReview(
  pool: Concept[],
  cardsPerSession: number,
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): ThemeCandidate | null {
  const candidates = viableThemes(pool, cardsPerSession);

  const requested = new URLSearchParams(search).get('reviewTheme');
  if (requested === 'off') return null;
  if (requested) {
    const theme = REVIEW_THEMES_BY_ID[requested];
    if (!theme) {
      console.warn(`[ReviewTheme] unknown theme "${requested}"; ignoring override`);
    } else {
      // An explicit request bypasses the viability threshold — otherwise a theme
      // couldn't be inspected until enough of its words were known.
      const words = themeMembers(theme, pool);
      if (words.length >= 4) return { theme, words };
      console.warn(`[ReviewTheme] "${requested}" has only ${words.length} known words; skipping`);
      return null;
    }
  }

  if (candidates.length === 0) return null;
  if (!isLocalDev() && Math.random() >= THEMED_REVIEW_CHANCE) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}
