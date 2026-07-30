/**
 * Quiz trivia generator.
 *
 * Called from QuizPage every Nth question (see TRIVIA_FREQUENCY_META) to produce
 * one short "did you know" card about a word the user just saw. The prompt is
 * deliberately constrained to the user's known vocabulary so the card teaches a
 * connection they can actually recognise, rather than introducing new words.
 *
 * Auth mirrors chat.ts: the client sends its Supabase access token and we verify
 * it before spending an Anthropic call.
 */
import { generateObject } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getModel, isModelConfigured } from './_model';

const SYSTEM_PROMPT = `You write one-card Mandarin trivia for a learner using the app "Saras."

You are given a FOCUS WORD the learner just answered in a quiz, plus the words
they already know. Produce a single surprising, memorable fact about the focus word.

PREFER these angles, in order:
1. Character reuse — a character in the focus word also appears in another word
   the learner already knows, and the shared character explains both meanings
   (e.g. 电 "electric" links 电话 "telephone" and 电视 "television").
2. Literal composition — what the characters literally say vs what the word means
   (e.g. 明白 is literally "bright + white" = "to understand").
3. Etymology or component logic — a radical or pictograph origin that makes the
   character stick.
4. Usage contrast — a near-synonym the learner knows and how the two differ.

RULES:
- Only reference words from the learner's known list. Never build the fact around
  a word they don't know.
- If nothing genuinely interesting connects to their known words, use angle 2 or 3
  on the focus word alone.
- Write pinyin first, characters in parentheses: "diànhuà (电话)". This applies to the
  TITLE as well as the body: never show a character without its pinyin. Write
  "miàn (面) links six directions", never "面 links six directions".
- Body must be 2 sentences max, under 220 characters. Conversational, not academic.
- NEVER use double quotes (") anywhere in the title or body — they corrupt the
  response and the card is lost. Use single quotes for glosses: shéi (谁) means 'who'.
- No preamble, no "Did you know" (the UI adds its own heading), no markdown headers.
- Never invent etymology. If you are not confident a claim is true, pick a
  different angle. Accuracy matters more than novelty.

SUGGESTION (exactly ONE, or null — this is the payoff of the card):
Pick the single best next word. Only these two kinds qualify:
  1. "missing_atom" — a single character the learner does NOT have as its own entry,
     but which already appears inside TWO OR MORE compounds they know. Learning the
     atom retroactively explains several words they already use. Cite those words in
     reason, e.g. "hides in 出租车 and 出去".
  2. "buildable_compound" — a short compound they can decode because its characters
     are already known to them, e.g. after 超市 chāoshì "supermarket", offer 超人
     chāorén "superman" when they know 超 and 人.
Prefer a missing_atom when one genuinely exists: it pays off across many words.

EXPLAIN EVERY CHARACTER:
- components MUST contain one entry for EVERY character in the suggested word, each
  with its own pinyin and meaning. Never leave a character unexplained — if you
  suggest 出口, the learner needs to know 口 means "mouth/opening", not just 出.
- Do not state whether the learner knows a character; the app determines that itself.

- NEVER suggest a word that appears in the learner's known list.
- Must be common, beginner-appropriate, and correct.
- A card with no suggestion is DISCARDED and never shown, so returning null wastes the
  whole card. It must be RARE. Work through the
  options before giving up: is any character of the focus word missing from their
  list despite appearing in words they know (kind 1)? Failing that, is there a common
  compound built from characters they already know (kind 2)? Only return null if both
  genuinely fail — never because you didn't look hard enough.`;

const PARTS_OF_SPEECH = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'conjunction', 'particle', 'numeral',
  'measure_word', 'interjection', 'other',
] as const;

const wordShape = {
  word: z.string().describe('Chinese characters'),
  pinyin: z.string().describe('Pinyin with tone marks'),
  meaning: z.string().describe('Short English meaning'),
  partOfSpeech: z.enum(PARTS_OF_SPEECH),
  category: z.string().describe('Semantic category, e.g. animal, food, action'),
};

const triviaSchema = z.object({
  title: z.string().describe('Punchy hook, max 6 words, e.g. "One character, two machines"'),
  body: z.string().describe('The fact itself. Max 2 sentences, under 220 characters, pinyin first.'),
  suggestion: z
    .object({
      ...wordShape,
      kind: z.enum(['missing_atom', 'buildable_compound']),
      reason: z.string().describe('Short phrase naming the link, e.g. "hides in 出租车 and 出去"'),
      components: z
        .array(z.object({
          char: z.string().describe('A single character from the suggested word'),
          pinyin: z.string(),
          meaning: z.string().describe('Short gloss for this character alone'),
        }))
        .describe('One entry per character in the suggested word. Never omit a character.'),
    })
    .nullable()
    .describe('The single best next word for the learner, or null if nothing genuinely fits.'),
});

interface TriviaWord {
  word: string;
  pinyin: string;
  meaning: string;
}

/**
 * A body that stops mid-sentence is the failure mode seen in practice: the text is
 * short and lacks terminal punctuation, e.g. "guǒ (果) means". Both signals are needed
 * because a truncation can land just past a length threshold.
 */
function isCompleteBody(body: string | undefined): boolean {
  const text = body?.trim() ?? '';
  return text.length >= 50 && /[.!?]$/.test(text);
}

/**
 * maxOutputTokens is set generously: the visible output is short, but reasoning tokens
 * count against the same budget, and a tight cap truncates the JSON mid-field.
 */
async function generateFact(prompt: string) {
  const result = await generateObject({
    model: getModel('TRIVIA_MODEL'),
    system: SYSTEM_PROMPT,
    prompt,
    schema: triviaSchema,
    maxOutputTokens: 4000,
  });

  // finishReason distinguishes the two candidate causes of a cut-off body: 'length'
  // means the token ceiling was hit (so raising it or trimming reasoning is the fix),
  // anything else means the model chose to stop and the prompt is at fault.
  if (result.finishReason !== 'stop') {
    console.error(
      `[trivia] finishReason=${result.finishReason} ` +
      `outputTokens=${result.usage?.outputTokens} totalTokens=${result.usage?.totalTokens}`,
    );
  }

  return result.object;
}

/**
 * A learner who can't read a character yet gets nothing from a bare hanzi, so every
 * character shown must carry its pinyin. The model follows this in the body but keeps
 * slipping in titles like "面 links six directions", hence this check.
 *
 * Characters inside parentheses are fine — that's the "pinyin (hanzi)" form.
 */
function hasBareHanzi(text: string): boolean {
  const withoutParentheticals = text.replace(/\([^)]*\)/g, '');
  return /\p{Script=Han}/u.test(withoutParentheticals);
}

/** Rewrite a title that shows characters without pinyin. Falls back to the original. */
async function ensureTitlePinyin(title: string): Promise<string> {
  if (!hasBareHanzi(title)) return title;

  try {
    const fixed = await generateObject({
      model: getModel('TRIVIA_MODEL'),
      system:
        'Rewrite the Mandarin trivia card title so no Chinese character appears without ' +
        'its pinyin. Use the form "pinyin (hanzi)", e.g. "面" becomes "miàn (面)". Keep ' +
        'the wording and length otherwise identical. Return only the rewritten title.',
      prompt: title,
      schema: z.object({ title: z.string() }),
      maxOutputTokens: 200,
    });
    return hasBareHanzi(fixed.object.title) ? title : fixed.object.title;
  } catch {
    // A slightly noisy title beats failing the whole card.
    return title;
  }
}

// ── Ranking mode ────────────────────────────────────────────────────────────────
// One fact is generated per quiz question, but only a small fraction are shown.
// This pass picks the keepers, so the cards a learner actually sees are the most
// surprising ones rather than whichever question happened to land at position 5.

const RANK_SYSTEM_PROMPT = `You curate Mandarin trivia cards for a learner.

You are given several candidate facts, each generated for a different word the
learner just practised. Pick the ones genuinely worth interrupting a quiz for.

RANK HIGHER:
- A connection that retroactively explains several words the learner already knows
  (e.g. a shared character running through three of their words).
- A concrete, surprising image that will stick (a character that pictures its meaning).
- A fact whose suggested word is a real unlock — an atom hiding inside words they know.

RANK LOWER:
- Generic or obvious composition ("two characters, each means what the word means").
- Vague etymology, or anything that reads like filler.
- Facts about function words with little semantic content.
- Anything that looks factually shaky.

Return indices ordered best first. Only include candidates actually worth showing —
returning fewer than requested is correct if the rest are filler.`;

const rankSchema = z.object({
  topIndices: z
    .array(z.number())
    .describe('Candidate indices, best first, limited to the requested count. May be shorter.'),
});

async function handleRanking(candidates: Array<{ word: string; title: string; body: string }>, keep: number) {
  const list = candidates
    .map((c, i) => `[${i}] word: ${c.word}\n    title: ${c.title}\n    fact: ${c.body}`)
    .join('\n\n');

  const result = await generateObject({
    model: getModel('TRIVIA_MODEL'),
    system: RANK_SYSTEM_PROMPT,
    prompt: `Pick the best ${keep} of these ${candidates.length} candidate facts.\n\n${list}`,
    schema: rankSchema,
  });

  // Guard the model's indices before the client trusts them as array offsets.
  const valid = result.object.topIndices
    .filter(i => Number.isInteger(i) && i >= 0 && i < candidates.length)
    .slice(0, keep);

  return new Response(JSON.stringify({ topIndices: valid }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req: Request) => {
  if (req.method === 'GET') {
    return new Response('ok', { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // NETLIFY_DEV is set only by the Netlify CLI running locally, never in production, so
  // this lets the /trivia harness work without a browser session while keeping the
  // deployed endpoint authenticated.
  const isLocalDev = process.env.NETLIFY_DEV === 'true';

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ') && !isLocalDev) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (authHeader) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response('Server misconfigured', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.warn('[trivia] unauthenticated request allowed (local dev only)');
  }

  if (!isModelConfigured()) {
    return new Response(
      JSON.stringify({ error: 'No LLM provider configured: set OPENROUTER_API_KEY or ANTHROPIC_API_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { focusWord, knownWords, recentWords, rankCandidates, keep } = await req.json() as {
    focusWord?: TriviaWord;
    knownWords?: TriviaWord[];
    recentWords?: string[];
    rankCandidates?: Array<{ word: string; title: string; body: string }>;
    keep?: number;
  };

  // Ranking requests carry candidates instead of a focus word
  if (rankCandidates?.length) {
    try {
      return await handleRanking(rankCandidates, Math.max(1, keep ?? 1));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[trivia] ranking failed: ${msg}`);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  if (!focusWord?.word) {
    return new Response(
      JSON.stringify({ error: 'focusWord is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const formatWord = (w: TriviaWord) => `${w.word} (${w.pinyin}) — ${w.meaning}`;
  const knownList = (knownWords ?? []).map(formatWord).join('\n');

  const prompt = [
    `FOCUS WORD: ${formatWord(focusWord)}`,
    knownList ? `\nLEARNER'S KNOWN WORDS:\n${knownList}` : '',
    recentWords?.length
      ? `\nAvoid repeating facts about these words, already covered this session: ${recentWords.join(', ')}`
      : '',
  ].join('');

  try {
    // Generation occasionally returns a body cut off mid-sentence ("guǒ (果) means"),
    // which renders as a broken card. One retry costs a few seconds and is invisible
    // to the user, since this all happens well before the card is reached.
    // A card is only worth showing if it both reads properly and offers a next word —
    // suggestion-less cards are consistently weak, so they're discarded rather than
    // shown. One retry costs a few seconds during background generation.
    let object = await generateFact(prompt);
    if (!isCompleteBody(object.body) || !object.suggestion) {
      const reason = !isCompleteBody(object.body) ? 'truncated' : 'no suggestion';
      console.error(`[trivia] ${reason} for ${focusWord.word} — retrying`);
      object = await generateFact(prompt);
    }

    if (!isCompleteBody(object.body)) {
      console.error(`[trivia] truncated again for ${focusWord.word}: ${JSON.stringify(object.body)}`);
      return new Response(
        JSON.stringify({ error: 'Incomplete fact generated' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!object.suggestion) {
      console.error(`[trivia] no suggestion for ${focusWord.word} after retry — discarding card`);
      return new Response(
        JSON.stringify({ error: 'No suggestion for this word' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const fact = { ...object, title: await ensureTitlePinyin(object.title) };

    return new Response(JSON.stringify(fact), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the real cause in the function log; the client only sees a short message.
    console.error(`[trivia] generation failed for ${focusWord.word}: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
