import { Lightbulb, Loader2, Volume2, ArrowRight, RefreshCw, Plus, Check, AlertTriangle } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { Concept } from '../types/vocabulary';
import type { AudioSettings } from '../types/settings';
import type { TriviaFact, TriviaSuggestion } from '../lib/triviaService';
import type { CharacterStatus } from '../lib/characterIndex';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';

/**
 * Loading state is intentionally dismissable: the LLM call happens mid-quiz, so a
 * slow or failed generation must never block the user from continuing.
 */
export type TriviaState =
  | { status: 'loading' }
  | { status: 'ready'; fact: TriviaFact }
  | { status: 'error'; message: string };

export type AddWordStatus = 'adding' | 'added' | 'error';

/**
 * The card's single next-word offer. Every character gets its own gloss: suggesting
 * 出口 while only explaining 出 leaves the learner guessing at 口.
 */
function SuggestionBlock({
  suggestion,
  status,
  alreadyKnown,
  onPlay,
  onAdd,
  lookupCharacter,
}: {
  suggestion: TriviaSuggestion;
  status?: AddWordStatus;
  alreadyKnown: boolean;
  onPlay: (word: string) => void;
  onAdd: (suggestion: TriviaSuggestion) => void;
  lookupCharacter?: (char: string) => CharacterStatus;
}) {
  return (
    <div className="mt-1">
      <p className="text-xs uppercase tracking-wide text-base-content/40 mb-1">
        {suggestion.kind === 'missing_atom' ? 'The missing piece' : 'You can build this'}
      </p>
      <div className="rounded-xl border border-warning/40 bg-base-100 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="hanzi text-2xl">{suggestion.word}</span>
          <div className="min-w-0 flex-1">
            <div className="pinyin text-sm text-secondary">{suggestion.pinyin}</div>
            <div className="text-xs leading-tight">{suggestion.meaning}</div>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-circle text-base-content/40 hover:text-primary"
            onClick={() => onPlay(suggestion.word)}
            title={`Listen to ${suggestion.word}`}
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {alreadyKnown ? (
            <span className="text-xs text-base-content/40 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              In vocab
            </span>
          ) : (
            <button
              className={`btn btn-sm gap-1 ${
                status === 'added' ? 'btn-success animate-pulse-correct' : 'btn-outline btn-warning'
              }`}
              onClick={() => onAdd(suggestion)}
              disabled={status === 'adding' || status === 'added'}
              title={status === 'added' ? 'Added to your words' : `Add ${suggestion.word} to your vocabulary`}
            >
              {status === 'adding' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {status === 'added' && <Check className="w-3.5 h-3.5" />}
              {status === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
              {!status && <Plus className="w-3.5 h-3.5" />}
              {status === 'added' ? 'Added' : status === 'error' ? 'Retry' : 'Add'}
            </button>
          )}
        </div>

        <p className="text-[11px] text-base-content/50">{suggestion.reason}</p>

        {/* Per-character breakdown so nothing in the word is a mystery */}
        {suggestion.components.length > 0 && (
          <div className="border-t border-base-300 pt-2 space-y-1">
            {suggestion.components.map((c, i) => {
              const known = lookupCharacter?.(c.char) ?? { kind: 'new' as const };
              return (
                <div key={`${c.char}-${i}`} className="flex items-baseline gap-2 text-xs">
                  <span className="hanzi text-base">{c.char}</span>
                  <span className="pinyin text-secondary">{c.pinyin}</span>
                  <span className="text-base-content/70 flex-1 leading-tight">{c.meaning}</span>
                  {known.kind === 'entry' && (
                    <span className="text-[11px] text-success whitespace-nowrap">you know it</span>
                  )}
                  {known.kind === 'seen' && (
                    <span className="text-[11px] text-base-content/40 whitespace-nowrap">
                      in <span className="hanzi">{known.word}</span>
                    </span>
                  )}
                  {known.kind === 'new' && (
                    <span className="text-[11px] text-warning whitespace-nowrap">new</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface TriviaCardProps {
  focus: Concept;
  /** Caption for the focus word, clarifying it is the fact's subject, not an offer */
  focusLabel?: string;
  state: TriviaState;
  audioSettings?: AudioSettings;
  /** Add-status per word, so the button reflects progress across re-renders */
  addedWords?: Record<string, AddWordStatus>;
  /** True when the word is already in the user's vocabulary (any paused state) */
  isKnownWord?: (word: string) => boolean;
  /** Real vocabulary status for a single character, used for the component breakdown */
  lookupCharacter?: (char: string) => CharacterStatus;
  onAddWord?: (suggestion: TriviaSuggestion) => void;
  onContinue: () => void;
  onRetry?: () => void;
}

export function TriviaCard({
  focus,
  focusLabel = 'About',
  state,
  audioSettings,
  addedWords = {},
  isKnownWord,
  lookupCharacter,
  onAddWord,
  onContinue,
  onRetry,
}: TriviaCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const ttsSupported = isTTSSupported();

  const playWord = useCallback(async (word: string) => {
    if (!ttsSupported) return;
    stopSpeaking();
    setIsPlaying(true);
    try {
      await speak(word, {
        voiceId: audioSettings ? getVoiceForCurrentBrowser(audioSettings) : undefined,
        rate: audioSettings?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setIsPlaying(false);
    }
  }, [ttsSupported, audioSettings]);

  return (
    <div className="card bg-base-200 shadow-xl border border-warning/40">
      <div className="card-body p-4 gap-3">
        <div className="flex items-center gap-2 text-warning">
          <Lightbulb className="w-5 h-5" />
          <span className="font-semibold text-sm uppercase tracking-wide">Did you know?</span>
        </div>

        {/* Focus word, kept compact and labelled: unlabelled, it reads as the word being
            suggested, when it's actually the word the fact is about. */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-base-content/40">
            {focusLabel}
          </span>
          <span className="hanzi text-xl font-bold text-primary">{focus.word}</span>
          <span className="pinyin text-sm text-secondary">{focus.pinyin}</span>
          {ttsSupported && (
            <button
              className={`btn btn-circle btn-xs ${isPlaying ? 'btn-error' : 'btn-ghost text-base-content/40 hover:text-primary'}`}
              onClick={() => playWord(focus.word)}
              title="Listen to pronunciation"
            >
              {isPlaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-6 text-base-content/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Finding something interesting…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-sm text-base-content/60 text-center">
              Couldn't load trivia right now.
            </p>
            <p className="text-xs text-base-content/40 text-center font-mono break-all px-2">
              {state.message}
            </p>
            {onRetry && (
              <button className="btn btn-sm btn-ghost gap-1" onClick={onRetry}>
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            )}
          </div>
        )}

        {state.status === 'ready' && (
          <div className="space-y-2">
            <h3 className="font-bold text-base text-center">{state.fact.title}</h3>
            <p className="text-sm leading-relaxed text-base-content/80">{state.fact.body}</p>
            {/* The one word this fact unlocks, addable in a single tap */}
            {state.fact.suggestion && onAddWord && (
              <SuggestionBlock
                suggestion={state.fact.suggestion}
                status={addedWords[state.fact.suggestion.word]}
                alreadyKnown={
                  addedWords[state.fact.suggestion.word] !== 'added' &&
                  Boolean(isKnownWord?.(state.fact.suggestion.word))
                }
                onPlay={playWord}
                onAdd={onAddWord}
                lookupCharacter={lookupCharacter}
              />
            )}
          </div>
        )}

        <button className="btn btn-primary w-full gap-1 mt-1" onClick={onContinue}>
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
