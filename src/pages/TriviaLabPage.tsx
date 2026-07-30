/**
 * Trivia lab — a throwaway page for exercising trivia generation without playing a
 * quiz. Not in the navbar; reachable at /trivia.
 *
 * Generating a card normally requires answering half a quiz, which makes iterating on
 * the prompt painfully slow. This calls the same endpoint directly and shows latency
 * plus the raw response, so prompt changes can be judged in seconds.
 */
import { useCallback, useMemo, useState } from 'react';
import { Zap, Shuffle, Code2, Layers, Loader2 } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { Concept } from '../types/vocabulary';
import { TriviaCard, type TriviaState } from '../components/TriviaCard';
import { fetchTrivia, type TriviaSuggestion } from '../lib/triviaService';
import { buildCharacterIndex, type CharacterStatus } from '../lib/characterIndex';
import type { AddWordStatus } from '../components/TriviaCard';

interface TriviaLabPageProps {
  store: VocabularyStore;
  settingsStore: SettingsStore;
}

interface Sample {
  focus: Concept;
  state: TriviaState;
  ms: number;
}

export function TriviaLabPage({ store, settingsStore }: TriviaLabPageProps) {
  const knownWords = useMemo(
    () => store.concepts.filter(c => !c.paused),
    [store.concepts],
  );

  const [focusId, setFocusId] = useState<string>('');
  const [state, setState] = useState<TriviaState | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [addedWords, setAddedWords] = useState<Record<string, AddWordStatus>>({});
  const [samples, setSamples] = useState<Sample[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const focus: Concept | undefined =
    knownWords.find(c => c.id === focusId) ?? knownWords[0];

  const characterIndex = useMemo(() => buildCharacterIndex(store.concepts), [store.concepts]);
  const lookupCharacter = useCallback(
    (char: string): CharacterStatus => characterIndex.get(char) ?? { kind: 'new' },
    [characterIndex],
  );

  const generate = useCallback(async (concept: Concept) => {
    setState({ status: 'loading' });
    setElapsedMs(null);
    const started = performance.now();
    try {
      const fact = await fetchTrivia(concept, knownWords, []);
      setElapsedMs(Math.round(performance.now() - started));
      setState({ status: 'ready', fact });
    } catch (err) {
      setElapsedMs(Math.round(performance.now() - started));
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [knownWords]);

  const generateRandom = useCallback(() => {
    if (knownWords.length === 0) return;
    const pick = knownWords[Math.floor(Math.random() * knownWords.length)];
    setFocusId(pick.id);
    generate(pick);
  }, [knownWords, generate]);

  /**
   * Generate a batch over random words so the spread of output can be judged at once:
   * how often each suggestion kind appears, and how often none does. Runs a few at a
   * time — a burst of parallel calls draws rate limiting.
   */
  const generateBatch = useCallback(async (count: number) => {
    if (knownWords.length === 0) return;
    setBatchRunning(true);
    setSamples([]);

    const picks = [...knownWords].sort(() => Math.random() - 0.5).slice(0, count);
    const CONCURRENCY = 3;

    for (let i = 0; i < picks.length; i += CONCURRENCY) {
      const group = picks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(group.map(async (concept): Promise<Sample> => {
        const started = performance.now();
        try {
          const fact = await fetchTrivia(concept, knownWords, []);
          return { focus: concept, state: { status: 'ready', fact }, ms: Math.round(performance.now() - started) };
        } catch (err) {
          return {
            focus: concept,
            state: { status: 'error', message: err instanceof Error ? err.message : String(err) },
            ms: Math.round(performance.now() - started),
          };
        }
      }));
      setSamples(prev => [...prev, ...results]);
    }

    setBatchRunning(false);
  }, [knownWords]);

  const batchSummary = useMemo(() => {
    const tally = { missing_atom: 0, buildable_compound: 0, none: 0, failed: 0 };
    for (const s of samples) {
      if (s.state.status !== 'ready') { tally.failed++; continue; }
      const kind = s.state.fact.suggestion?.kind;
      if (kind === 'missing_atom') tally.missing_atom++;
      else if (kind === 'buildable_compound') tally.buildable_compound++;
      else tally.none++;
    }
    return tally;
  }, [samples]);

  const handleAddWord = useCallback(async (suggestion: TriviaSuggestion) => {
    if (store.getConceptByWord(suggestion.word)) {
      setAddedWords(prev => ({ ...prev, [suggestion.word]: 'added' }));
      return;
    }
    setAddedWords(prev => ({ ...prev, [suggestion.word]: 'adding' }));
    try {
      await store.addCustomWord(
        suggestion.word,
        suggestion.pinyin,
        suggestion.meaning,
        suggestion.partOfSpeech,
        suggestion.category,
      );
      setAddedWords(prev => ({ ...prev, [suggestion.word]: 'added' }));
    } catch {
      setAddedWords(prev => ({ ...prev, [suggestion.word]: 'error' }));
    }
  }, [store]);

  return (
    <div className="h-full overflow-auto bg-base-200">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold">Trivia Lab</h1>
          <p className="text-sm text-base-content/60">
            Generate a card for any known word, without playing a quiz.
            {' '}{knownWords.length} words available.
          </p>
        </div>

        <div className="card bg-base-100 shadow">
          <div className="card-body p-4 gap-3">
            <select
              className="select select-bordered w-full"
              value={focus?.id ?? ''}
              onChange={e => setFocusId(e.target.value)}
            >
              {knownWords.map(c => (
                <option key={c.id} value={c.id}>
                  {c.word} · {c.pinyin} · {c.meaning}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                className="btn btn-primary flex-1 gap-1"
                onClick={() => focus && generate(focus)}
                disabled={!focus || state?.status === 'loading'}
              >
                <Zap className="w-4 h-4" />
                Generate
              </button>
              <button
                className="btn btn-outline gap-1"
                onClick={generateRandom}
                disabled={knownWords.length === 0 || state?.status === 'loading'}
              >
                <Shuffle className="w-4 h-4" />
                Random
              </button>
            </div>

            {elapsedMs !== null && (
              <p className="text-xs text-base-content/50">
                Took {(elapsedMs / 1000).toFixed(1)}s
                {state?.status === 'error' && ' · failed'}
              </p>
            )}

            <div className="border-t border-base-300 pt-3">
              <button
                className="btn btn-secondary btn-sm w-full gap-1"
                onClick={() => generateBatch(10)}
                disabled={batchRunning || knownWords.length === 0}
              >
                {batchRunning
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating {samples.length}/10…</>
                  : <><Layers className="w-4 h-4" /> Sample 10 random words</>}
              </button>
              {samples.length > 0 && (
                <p className="text-xs text-base-content/60 mt-2">
                  {batchSummary.missing_atom} missing-atom · {batchSummary.buildable_compound} buildable
                  · {batchSummary.none} no suggestion · {batchSummary.failed} failed
                </p>
              )}
            </div>
          </div>
        </div>

        {state && focus && (
          <TriviaCard
            focus={focus}
            focusLabel="Fact about"
            state={state}
            audioSettings={settingsStore.settings.audio}
            addedWords={addedWords}
            isKnownWord={word => Boolean(store.getConceptByWord(word))}
            lookupCharacter={lookupCharacter}
            onAddWord={handleAddWord}
            onContinue={generateRandom}
          />
        )}

        {state?.status === 'ready' && (
          <div className="card bg-base-100 shadow">
            <div className="card-body p-3">
              <button
                className="btn btn-ghost btn-xs gap-1 self-start"
                onClick={() => setShowRaw(v => !v)}
              >
                <Code2 className="w-3.5 h-3.5" />
                {showRaw ? 'Hide' : 'Show'} raw response
              </button>
              {showRaw && (
                <pre className="text-[11px] overflow-x-auto bg-base-200 rounded p-2">
                  {JSON.stringify(state.fact, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Batch results, so the spread of output is visible in one scroll */}
        {samples.map((sample, i) => (
          <div key={`${sample.focus.id}-${i}`} className="space-y-1">
            <p className="text-xs text-base-content/40">
              #{i + 1} · {sample.focus.word} · {(sample.ms / 1000).toFixed(1)}s
              {sample.state.status === 'ready' && (
                <> · {sample.state.fact.suggestion?.kind ?? 'no suggestion'}</>
              )}
            </p>
            <TriviaCard
              focus={sample.focus}
              focusLabel="Fact about"
              state={sample.state}
              audioSettings={settingsStore.settings.audio}
              addedWords={addedWords}
              isKnownWord={word => Boolean(store.getConceptByWord(word))}
              lookupCharacter={lookupCharacter}
              onAddWord={handleAddWord}
              onContinue={() => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
