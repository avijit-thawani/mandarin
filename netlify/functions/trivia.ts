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

You are given a FOCUS WORD the learner just answered in a quiz, plus the words they
already know. Write one surprising, memorable fact about the focus word — and, when the
data supports it, offer ONE next word to learn.

## THE FACT

PREFER these angles, in order:
1. Character reuse — a character in the focus word also appears in another word the
   learner already knows, and the shared character explains both meanings
   (e.g. 电 "electric" links 电话 "telephone" and 电视 "television").
2. Literal composition — what the characters literally say vs what the word means
   (e.g. 明白 is literally "bright + white" = "to understand").
3. Etymology or component logic — a radical or pictograph origin that makes it stick.
4. Usage contrast — a near-synonym the learner knows and how the two differ.

RULES:
- Only reference words from the learner's known list. Never build the fact around a
  word they don't know.
- Write pinyin first, characters in parentheses: "diànhuà (电话)". This applies to the
  TITLE as well as the body: never show a character without its pinyin. Write
  "miàn (面) links six directions", never "面 links six directions".
- Body must be 2 sentences max, under 220 characters. Conversational, not academic.
- NEVER use double quotes (") anywhere in the title or body — they corrupt the
  response and the card is lost. Use single quotes for glosses: shéi (谁) means 'who'.
- No preamble, no "Did you know" (the UI adds its own heading), no markdown headers.
- Write the fact as ONE finished thought. Never narrate your reasoning, never correct
  yourself mid-sentence, never write phrases like "wait", "actually", "on second
  thought", or "that's not right". Decide first, then write the final version only.
- Never invent etymology. If you are not confident a claim is true, pick a different
  angle. Accuracy matters more than novelty.

## THE SUGGESTION

Exactly ONE next word, or null. There are only two valid shapes, and the app verifies
both — a suggestion that fails verification is thrown away, so guessing costs you the
suggestion entirely.

1. "missing_atom" — a single character the learner reads inside words they know but
   never learned alone. You do NOT get to invent these: the prompt gives you a list
   under MISSING ATOMS, already verified against the learner's full vocabulary. Pick
   one character from that list, verbatim, or don't use this shape at all. Prefer an
   atom that appears in the FOCUS WORD, so the card and its offer are about the same
   thing. In reason, cite the words it hides in, e.g. "hides in 出租车 and 出去".

2. "buildable_compound" — a real, common multi-character word whose EVERY character
   appears in the OWNED CHARACTERS list. This is the one place your knowledge is
   needed, because the app can't tell which character combinations are real words.
   Two hard limits: the word must genuinely exist in Mandarin, and every single
   character must be in that list. If even one character is absent, the suggestion is
   discarded. Example: given 超 and 人, chāorén (超人) "superman" is valid.

Prefer a missing_atom when the list offers one connected to the focus word — it pays
off across several words the learner already uses.

THE FACT AND THE SUGGESTION MUST BE ABOUT THE SAME THING. If your fact is about 面,
do not then suggest an unrelated word. The suggested word must share a character with
either the focus word or the word your fact discusses. If nothing connects, return
null for the suggestion and let the fact stand alone.

A null suggestion is completely fine. The card is still shown as a plain fact, so a
good fact with no offer beats a good fact with a forced, unrelated offer. Do not
stretch for a suggestion you can't justify.

## THE SUGGESTED WORD'S MEANING

The meaning you write becomes a quiz prompt, so it must identify exactly one word:
- NEVER reuse or restate the meaning of a word in the learner's known list. If your
  candidate means roughly what one of their words means, the learner will see two
  cards with the same English and be unable to answer either. The prompt lists the
  NEAREST EXISTING ENTRIES for this reason: write a meaning that distinguishes your
  word from them, or pick a different word.
- No Chinese characters in the meaning field.
- No romanised pinyin in the meaning field.
- No linguistics jargon: never write "MW", "measure word", "diminutive", "suffix",
  "particle" or "marker". Write "counting word for books", not "measure word (books)".
- components MUST contain one entry for EVERY character of the suggested word, each
  with its own pinyin and meaning. If you suggest 出口, the learner needs to know 口
  means 'mouth, opening', not just 出.
- Do not state whether the learner knows a character; the app determines that itself.`;

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

interface MissingAtom {
  char: string;
  compounds: string[];
}

type Suggestion = NonNullable<z.infer<typeof triviaSchema>['suggestion']>;

// ── Suggestion verification ─────────────────────────────────────────────────────
// The model is told the two valid shapes, but telling is not enforcing: `kind` is a
// self-reported string, and earlier versions happily returned a "buildable_compound"
// built from characters the learner had never seen. Everything below re-derives the
// claim from the data. A suggestion that fails is dropped and the card ships as a
// plain fact, which is strictly better than showing an offer that doesn't hold.

const JARGON = [
  'measure word', 'mw', 'diminutive', 'suffix', 'prefix', 'particle', 'marker',
  'classifier', 'nominaliser', 'nominalizer',
];

/** Tone-marked vowels, i.e. romanised pinyin leaking into a gloss the quiz will show. */
const PINYIN_TONES = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/i;

/**
 * Reduce a gloss to the sense it actually tests, so near-duplicates collide.
 * "to give; for" and "The day after tomorrow" both normalise to their bare senses —
 * exact-string comparison misses these, and they are the dangerous class: two cards
 * with indistinguishable English make both unanswerable.
 */
function glossSenses(meaning: string): string[] {
  return meaning
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .split(/[;,/]/)
    .map(s => s.trim().replace(/^(to|the|a|an)\s+/, '').replace(/[.!?]$/, '').trim())
    .filter(Boolean);
}

/** Known entries whose gloss tests the same sense as `meaning`. */
function collidingEntries(meaning: string, knownWords: TriviaWord[]): TriviaWord[] {
  const senses = new Set(glossSenses(meaning));
  return knownWords.filter(w => glossSenses(w.meaning).some(s => senses.has(s)));
}

/**
 * Check the claimed shape against the learner's real vocabulary.
 * Returns null when the suggestion holds, or a short reason for the log when it doesn't.
 */
function shapeFailure(
  suggestion: Suggestion,
  atoms: MissingAtom[],
  ownedChars: string[],
  allKnownWords: string[],
): string | null {
  const word = suggestion.word?.trim() ?? '';
  if (!word) return 'empty word';
  if (allKnownWords.includes(word)) return 'already in vocabulary';

  if (suggestion.kind === 'missing_atom') {
    // The app supplied the candidate list, so anything off-list was invented.
    if ([...word].length !== 1) return `missing_atom must be one character, got ${word}`;
    if (!atoms.some(a => a.char === word)) return `${word} is not a verified missing atom`;
    return null;
  }

  // buildable_compound: the whole promise is that the learner can already read every
  // character, so one unknown character voids it.
  if ([...word].length < 2) return `buildable_compound must be 2+ characters, got ${word}`;
  const owned = new Set(ownedChars);
  const unknown = [...word].filter(c => !owned.has(c));
  if (unknown.length > 0) return `characters not owned by learner: ${unknown.join('')}`;
  return null;
}

/** Gloss rules from the vocabulary cleanup: a meaning is quiz prompt text, not a dictionary line. */
function glossFailure(meaning: string): string | null {
  const text = meaning?.trim() ?? '';
  if (!text) return 'empty meaning';
  if (/\p{Script=Han}/u.test(text)) return 'meaning contains hanzi';
  if (PINYIN_TONES.test(text)) return 'meaning contains pinyin';
  const found = JARGON.find(j => new RegExp(`\\b${j}\\b`, 'i').test(text));
  return found ? `meaning contains jargon: ${found}` : null;
}

/**
 * Rewrite a colliding gloss so it distinguishes the new word from the entries it
 * clashes with, rather than dropping an otherwise good suggestion. This is the 些/少
 * failure: both glossed as interchangeable English, both stuck near 52% accuracy.
 */
async function distinguishMeaning(
  suggestion: Suggestion,
  clashes: TriviaWord[],
): Promise<string | null> {
  try {
    const list = clashes.map(c => `${c.word} (${c.pinyin}) — ${c.meaning}`).join('\n');
    const result = await generateObject({
      model: getModel('TRIVIA_MODEL'),
      system:
        'You fix a Mandarin vocabulary gloss that collides with words the learner already has. ' +
        'Rewrite the meaning so a learner reading it alone could only think of the new word, ' +
        'never one of the existing ones — name the functional or contextual difference. ' +
        'No Chinese characters, no pinyin, no linguistics jargon (never "measure word", ' +
        '"particle", "suffix"); write for a beginner. Under 60 characters. ' +
        'If the words are genuinely interchangeable and no honest distinction exists, return an empty string.',
      prompt:
        `NEW WORD: ${suggestion.word} (${suggestion.pinyin})\n` +
        `PROPOSED MEANING: ${suggestion.meaning}\n\n` +
        `COLLIDES WITH:\n${list}`,
      schema: z.object({ meaning: z.string() }),
      maxOutputTokens: 300,
    });
    const fixed = result.object.meaning.trim();
    return fixed && !glossFailure(fixed) ? fixed : null;
  } catch {
    return null;
  }
}

/**
 * Apply every check to a suggestion, repairing the gloss where possible.
 * Returns the suggestion to ship (possibly with a rewritten meaning) plus, when it was
 * dropped, why — which the client logs so bad shapes are measurable rather than guessed at.
 */
async function verifySuggestion(
  suggestion: Suggestion | null,
  atoms: MissingAtom[],
  ownedChars: string[],
  allKnownWords: string[],
  knownWords: TriviaWord[],
): Promise<{ suggestion: Suggestion | null; dropReason?: string }> {
  if (!suggestion) return { suggestion: null, dropReason: 'model returned none' };

  const shape = shapeFailure(suggestion, atoms, ownedChars, allKnownWords);
  if (shape) return { suggestion: null, dropReason: shape };

  const gloss = glossFailure(suggestion.meaning);
  if (gloss) return { suggestion: null, dropReason: gloss };

  const clashes = collidingEntries(suggestion.meaning, knownWords);
  if (clashes.length > 0) {
    const rewritten = await distinguishMeaning(suggestion, clashes);
    if (!rewritten) {
      return { suggestion: null, dropReason: `gloss collides with ${clashes.map(c => c.word).join(',')}` };
    }
    return { suggestion: { ...suggestion, meaning: rewritten } };
  }

  return { suggestion };
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

  const {
    focusWord, knownWords, recentWords, rankCandidates, keep,
    missingAtoms, ownedCharacters, allKnownWords,
  } = await req.json() as {
    focusWord?: TriviaWord;
    knownWords?: TriviaWord[];
    recentWords?: string[];
    rankCandidates?: Array<{ word: string; title: string; body: string }>;
    keep?: number;
    missingAtoms?: MissingAtom[];
    ownedCharacters?: string[];
    allKnownWords?: string[];
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

  // Atoms connected to the focus word come first: an offer about the word just
  // practised reads as a continuation of the fact rather than a change of subject.
  const focusChars = new Set([...focusWord.word]);
  const atoms = [...(missingAtoms ?? [])].sort(
    (a, b) => Number(focusChars.has(b.char)) - Number(focusChars.has(a.char)),
  );
  const atomList = atoms
    .slice(0, 30)
    .map(a => `${a.char} — hides in ${a.compounds.slice(0, 4).join(', ')}`)
    .join('\n');

  const prompt = [
    `FOCUS WORD: ${formatWord(focusWord)}`,
    knownList ? `\n\nLEARNER'S KNOWN WORDS (with the glosses the quiz shows):\n${knownList}` : '',
    atomList
      ? `\n\nMISSING ATOMS — verified characters the learner reads inside these words but ` +
        `never learned alone. A missing_atom suggestion MUST be one of these, copied exactly:\n${atomList}`
      : `\n\nMISSING ATOMS: none available for this learner right now, so missing_atom is not an option.`,
    ownedCharacters?.length
      ? `\n\nOWNED CHARACTERS — every character the learner has as its own entry. A ` +
        `buildable_compound may use ONLY these:\n${ownedCharacters.join(' ')}`
      : '',
    recentWords?.length
      ? `\n\nAvoid repeating facts about these words, already covered this session: ${recentWords.join(', ')}`
      : '',
  ].join('');

  try {
    // Generation occasionally returns a body cut off mid-sentence ("guǒ (果) means"),
    // which renders as a broken card. One retry costs a few seconds and is invisible
    // to the user, since this all happens well before the card is reached.
    //
    // A missing suggestion is NOT a retry trigger and no longer discards the card: a
    // mandatory suggestion is exactly what used to produce forced, unrelated offers
    // ("A hides in 4 words, so add B"). A plain fact is a legitimate card.
    let object = await generateFact(prompt);
    if (!isCompleteBody(object.body)) {
      console.error(`[trivia] truncated for ${focusWord.word} — retrying`);
      object = await generateFact(prompt);
    }

    if (!isCompleteBody(object.body)) {
      console.error(`[trivia] truncated again for ${focusWord.word}: ${JSON.stringify(object.body)}`);
      return new Response(
        JSON.stringify({ error: 'Incomplete fact generated' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { suggestion, dropReason } = await verifySuggestion(
      object.suggestion,
      atoms,
      ownedCharacters ?? [],
      allKnownWords ?? (knownWords ?? []).map(w => w.word),
      knownWords ?? [],
    );
    if (dropReason) {
      console.warn(`[trivia] suggestion dropped for ${focusWord.word}: ${dropReason}`);
    }

    const fact = {
      ...object,
      suggestion,
      title: await ensureTitlePinyin(object.title),
      cardType: suggestion?.kind ?? 'fact',
      suggestionDropReason: dropReason ?? null,
    };

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
