// Character-level view of the user's vocabulary.
//
// Trivia cards break a suggested word into its characters and label each one. The
// model used to report that status and got it wrong (marking a word the user had just
// been quizzed on as "new"), so the app derives it from the real word list instead.

import type { Concept } from '../types/vocabulary';

export type CharacterStatus =
  | { kind: 'entry' }              // the character is a vocabulary entry in its own right
  | { kind: 'seen'; word: string } // appears inside a word they know
  | { kind: 'new' };

/** A character the learner never learned alone, but already reads inside their words. */
export interface MissingAtom {
  char: string;
  /** The distinct words it hides in, best evidence first. */
  compounds: string[];
}

/**
 * Compounds that aren't just a longer dressing of a shorter one the learner also knows.
 *
 * Without this, 期 looks like it "hides in 10 words" — but nine of them are 星期一,
 * 星期二, 星期三 … i.e. one stem wearing ten hats, which makes for a padded card. A
 * compound only counts as independent evidence if it doesn't contain a shorter known
 * compound (星期一 contains 星期, so it's dropped; 学期 and 星期 both stand).
 */
function stemCompounds(words: string[]): string[] {
  const compounds = words.filter(w => [...w].length > 1);
  return compounds.filter(word =>
    !compounds.some(other =>
      other !== word && [...other].length < [...word].length && word.includes(other)),
  );
}

/**
 * Characters that already appear inside two or more of the learner's words but were
 * never learned on their own. These are the strongest suggestions the app can make,
 * and — unlike a compound the learner could build — they're fully derivable from the
 * vocabulary, so the app picks them itself rather than asking a model to guess.
 */
export function findMissingAtoms(concepts: Concept[]): MissingAtom[] {
  const entries = new Set(concepts.filter(c => [...c.word].length === 1).map(c => c.word));
  const stems = stemCompounds(concepts.map(c => c.word));

  const hidesIn = new Map<string, string[]>();
  for (const stem of stems) {
    for (const char of new Set([...stem])) {
      if (entries.has(char)) continue;
      hidesIn.set(char, [...(hidesIn.get(char) ?? []), stem]);
    }
  }

  return [...hidesIn.entries()]
    .filter(([, compounds]) => compounds.length >= 2)
    .map(([char, compounds]) => ({ char, compounds }))
    .sort((a, b) => b.compounds.length - a.compounds.length);
}

/** Single characters the learner owns outright — the only building blocks a compound suggestion may use. */
export function ownedCharacters(concepts: Concept[]): string[] {
  return concepts.filter(c => [...c.word].length === 1).map(c => c.word);
}

export function buildCharacterIndex(concepts: Concept[]): Map<string, CharacterStatus> {
  const index = new Map<string, CharacterStatus>();

  for (const concept of concepts) {
    if (concept.word.length === 1) {
      index.set(concept.word, { kind: 'entry' });
      continue;
    }
    for (const char of concept.word) {
      // A standalone entry is stronger evidence than appearing inside a compound.
      if (index.get(char)?.kind === 'entry') continue;
      index.set(char, { kind: 'seen', word: concept.word });
    }
  }

  return index;
}
