import { streamText, tool, UIMessage, convertToModelMessages } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const SYSTEM_PROMPT = `You are a friendly Mandarin Chinese tutor in the app "Saras."
The user is learning Mandarin with spaced repetition.

GUIDELINES:
- Use pinyin as the primary reference; add characters when helpful
- Mix Chinese and English naturally; lean toward more Chinese as proficiency grows
- Correct mistakes gently; explain the "why"
- Keep responses concise -- mobile chat interface
- Be encouraging; celebrate progress

ADDING WORDS:
- To activate an existing paused word, use unpause_words
- To add a brand new word, use add_custom_word with accurate pinyin (tone marks),
  meaning, and part_of_speech
- Always confirm with the user before calling add/unpause tools
- part_of_speech must be one of: noun, verb, adjective, adverb, pronoun,
  preposition, conjunction, particle, numeral, measure_word, interjection, other

REMOVING/PAUSING:
- pause_words hides from quiz/study (reversible)
- delete_words permanently removes a custom word (only source:'chat' words)
- Never delete HSK1 words -- only pause them

IMPORTANT:
- Be accurate with pinyin tone marks -- they feed the quiz system directly
- When unsure about a word's accuracy, say so rather than guessing`;

const tools = {
  add_custom_word: tool({
    description: 'Add a brand new word to the user\'s study set. Only use for words not already in their vocabulary.',
    inputSchema: z.object({
      word: z.string().describe('Chinese characters'),
      pinyin: z.string().describe('Pinyin with tone marks (e.g. māo, not mao)'),
      meaning: z.string().describe('English meaning'),
      part_of_speech: z.enum([
        'noun', 'verb', 'adjective', 'adverb', 'pronoun',
        'preposition', 'conjunction', 'particle', 'numeral',
        'measure_word', 'interjection', 'other',
      ]),
      category: z.string().optional().describe('Semantic category (e.g. animal, food, action). Defaults to "other".'),
    }),
    execute: async ({ word, pinyin, meaning, part_of_speech, category }) => ({
      action: 'add_custom_word',
      word, pinyin, meaning, part_of_speech,
      category: category || 'other',
      status: 'pending_client',
    }),
  }),

  unpause_words: tool({
    description: 'Mark existing paused words as known (active in quiz/study). Use when the user wants to start studying words already in their vocabulary.',
    inputSchema: z.object({
      words: z.array(z.string()).describe('Chinese characters of words to unpause'),
    }),
    execute: async ({ words }) => ({
      action: 'unpause_words',
      words,
      status: 'pending_client',
    }),
  }),

  pause_words: tool({
    description: 'Mark words as unknown (hide from quiz/study). Reversible.',
    inputSchema: z.object({
      words: z.array(z.string()).describe('Chinese characters of words to pause'),
    }),
    execute: async ({ words }) => ({
      action: 'pause_words',
      words,
      status: 'pending_client',
    }),
  }),

  delete_words: tool({
    description: 'Permanently remove custom words (source: "chat" only). HSK1 words cannot be deleted, only paused.',
    inputSchema: z.object({
      words: z.array(z.string()).describe('Chinese characters of words to delete'),
    }),
    execute: async ({ words }) => ({
      action: 'delete_words',
      words,
      status: 'pending_client',
    }),
  }),
};

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify Supabase auth
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { messages, vocabContext } = await req.json() as {
    messages: UIMessage[];
    vocabContext?: string;
  };

  const systemWithContext = vocabContext
    ? `${SYSTEM_PROMPT}\n\nUSER'S CURRENT VOCABULARY:\n${vocabContext}`
    : SYSTEM_PROMPT;

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemWithContext,
      messages: await convertToModelMessages(messages),
      tools,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
