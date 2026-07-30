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
