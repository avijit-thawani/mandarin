/**
 * Model selection for the LLM-backed functions (chat, trivia).
 *
 * OpenRouter is preferred when configured: one key covers every provider, so trying a
 * different model is an env var change rather than a code change. Anthropic direct
 * remains the fallback so existing deployments keep working untouched.
 *
 * Env:
 *   OPENROUTER_API_KEY  enables OpenRouter
 *   TRIVIA_MODEL        model slug for trivia generation/ranking (OpenRouter naming)
 *   CHAT_MODEL          model slug for the chat tutor
 *   ANTHROPIC_API_KEY   used when OpenRouter is not configured
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

const ANTHROPIC_FALLBACK_MODEL = 'claude-sonnet-4-6';
// Same model we called directly via Anthropic, so switching providers changes the
// route without changing behaviour.
const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

export function isModelConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Resolve a model for the given role. `envKey` lets each caller override the slug
 * without touching this file (e.g. a cheaper model for trivia than for chat).
 */
export function getModel(envKey: 'TRIVIA_MODEL' | 'CHAT_MODEL'): LanguageModel {
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    const openrouter = createOpenRouter({
      apiKey: openrouterKey,
      // Surfaces the app on OpenRouter's dashboard and rankings.
      headers: {
        'HTTP-Referer': 'https://saras-mandarin.netlify.app',
        'X-Title': 'Saras Mandarin',
      },
    });
    return openrouter(process.env[envKey] || OPENROUTER_DEFAULT_MODEL);
  }

  return anthropic(process.env[envKey] || ANTHROPIC_FALLBACK_MODEL);
}
