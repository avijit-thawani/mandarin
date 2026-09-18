// Trivia analytics — every card generated, whether or not it was ever shown.
//
// Cards are generated for most questions and only a fraction reach the screen, so
// judging quality from what got shown would sample the wrong population. Each row is
// written at generation time with `shown: false`, then updated if the card is displayed
// and again if the suggested word is added. The gap between those three counts is the
// signal: generated -> shown -> accepted.
//
// Words are stored as text, never as a vocabulary_id. A log row has to survive vocabulary
// edits and deletions; a foreign key here would let a vocab change erase history.

import { supabase } from './supabase';
import type { TriviaFact } from './triviaService';

/** Row id for a logged card, used to attach the later outcomes. Null when logging failed. */
export type TriviaLogId = string | null;

/**
 * Record a generated card. Never throws: analytics failing must not disturb a quiz,
 * so errors are logged to the console and the caller carries on with a null id.
 */
export async function logTriviaCard(
  focusWord: string,
  fact: TriviaFact,
  sessionId?: string,
): Promise<TriviaLogId> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('trivia_log')
      .insert({
        user_id: user.id,
        card_type: fact.cardType,
        focus_word: focusWord,
        title: fact.title,
        body: fact.body,
        suggested_word: fact.suggestion?.word ?? null,
        suggested_pinyin: fact.suggestion?.pinyin ?? null,
        suggested_meaning: fact.suggestion?.meaning ?? null,
        suggestion_reason: fact.suggestion?.reason ?? null,
        // A card can be generated fine yet have its suggestion rejected; recording the
        // reason is what makes bad shapes countable instead of anecdotal.
        discard_reason: fact.suggestionDropReason ?? null,
        session_id: sessionId ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id as string;
  } catch (err) {
    console.error('[triviaLog] failed to log card:', err);
    return null;
  }
}

/** Mark a logged card as actually displayed to the user. */
export async function markTriviaShown(id: TriviaLogId): Promise<void> {
  if (!id) return;
  const { error } = await supabase.from('trivia_log').update({ shown: true }).eq('id', id);
  if (error) console.error('[triviaLog] failed to mark shown:', error);
}

/** Mark that the user accepted the card's suggestion and added the word. */
export async function markTriviaWordAdded(id: TriviaLogId): Promise<void> {
  if (!id) return;
  const { error } = await supabase.from('trivia_log').update({ word_added: true }).eq('id', id);
  if (error) console.error('[triviaLog] failed to mark word added:', error);
}
