// Trivia service — fetches LLM-generated "did you know" cards for the Quiz tab.
//
// The heavy lifting (prompting, Anthropic call) lives in netlify/functions/trivia.ts.
// This module handles auth headers, payload trimming, and a session-scoped cache so
// revisiting the same card (e.g. after a re-render) doesn't spend another LLM call.

import { supabase } from './supabase';
import type { Concept } from '../types/vocabulary';

const TRIVIA_ENDPOINT = '/.netlify/functions/trivia';

// Cap the known-word list we send. The full list can be 350+ words, which bloats
// the prompt without improving the fact — a sample around the focus word is enough.
const MAX_KNOWN_WORDS = 120;

/** Full detail for a word shown on a trivia card, enough to render all four modalities. */
export interface TriviaWord {
  word: string;
  pinyin: string;
  meaning: string;
  partOfSpeech: string;
  category: string;
}

/**
 * Per-character gloss so no component of a suggested word is left unexplained.
 * Whether the user knows the character is decided by the client against the actual
 * vocabulary — the model used to report it and got it wrong.
 */
export interface TriviaComponent {
  char: string;
  pinyin: string;
  meaning: string;
}

/**
 * The single next word a card offers.
 * - `missing_atom`: a character they lack that already hides inside words they know
 * - `buildable_compound`: a compound they can decode from characters they know
 */
export interface TriviaSuggestion extends TriviaWord {
  kind: 'missing_atom' | 'buildable_compound';
  reason: string;
  components: TriviaComponent[];
}

export interface TriviaFact {
  title: string;
  body: string;
  suggestion: TriviaSuggestion | null;
}

/**
 * Pick the known words most likely to yield an interesting connection:
 * words sharing a character with the focus word first, then a random sample.
 */
function selectContextWords(focus: Concept, knownWords: Concept[]): Concept[] {
  const focusChars = new Set(focus.word.split(''));
  const others = knownWords.filter(c => c.id !== focus.id);

  const sharing: Concept[] = [];
  const rest: Concept[] = [];
  for (const c of others) {
    if (c.word.split('').some(ch => focusChars.has(ch))) {
      sharing.push(c);
    } else {
      rest.push(c);
    }
  }

  const remaining = MAX_KNOWN_WORDS - sharing.length;
  if (remaining <= 0) return sharing.slice(0, MAX_KNOWN_WORDS);

  // Random sample of the rest so repeat sessions surface different connections.
  const shuffled = [...rest];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return [...sharing, ...shuffled.slice(0, remaining)];
}

/**
 * Attach the Supabase token when there is one. A missing session is not treated as a
 * client-side failure: the server decides. That keeps the local /trivia harness usable
 * without a browser session, while the deployed endpoint still returns 401.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

const toPayloadWord = (c: Concept) => ({
  word: c.word,
  pinyin: c.pinyin,
  meaning: c.meaning,
});

/**
 * Generate a trivia card about `focus`, grounded in the user's known vocabulary.
 * Throws on auth/network/LLM failure — callers should render a soft failure and
 * let the user continue the quiz.
 */
export async function fetchTrivia(
  focus: Concept,
  knownWords: Concept[],
  alreadyCoveredWords: string[] = [],
  signal?: AbortSignal,
): Promise<TriviaFact> {
  const response = await fetch(TRIVIA_ENDPOINT, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      focusWord: toPayloadWord(focus),
      knownWords: selectContextWords(focus, knownWords).map(toPayloadWord),
      recentWords: alreadyCoveredWords,
    }),
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // Non-JSON error body — keep the status code as the detail.
    }
    throw new Error(detail);
  }

  const fact = await response.json() as TriviaFact;
  if (!fact?.body) {
    throw new Error('Empty trivia response');
  }

  // Defend against the model suggesting a word the user already has: the prompt
  // forbids it, but a duplicate offer is confusing enough to be worth filtering.
  const knownSet = new Set(knownWords.map(w => w.word));
  const suggestion = fact.suggestion?.word && !knownSet.has(fact.suggestion.word)
    ? { ...fact.suggestion, components: fact.suggestion.components ?? [] }
    : null;

  return { ...fact, suggestion };
}

/**
 * Ask the model which of the generated facts are worth showing.
 *
 * A fact is generated for every question, but only a small fraction are shown, so
 * this decides the keepers. Returns indices into `candidates`, best first. On any
 * failure the caller should fall back to its own ordering rather than showing none.
 */
export async function rankTrivia(
  candidates: Array<{ word: string; title: string; body: string }>,
  keep: number,
  signal?: AbortSignal,
): Promise<number[]> {
  const response = await fetch(TRIVIA_ENDPOINT, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ rankCandidates: candidates, keep }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ranking failed: HTTP ${response.status}`);
  }

  const { topIndices } = await response.json() as { topIndices?: number[] };
  return (topIndices ?? []).filter(i => Number.isInteger(i) && i >= 0 && i < candidates.length);
}
