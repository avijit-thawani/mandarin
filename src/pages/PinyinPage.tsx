import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, Loader2, BookOpen, Mic, Headphones, ChevronRight, RotateCcw, ThumbsUp, ThumbsDown, Eye, EyeOff } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { Concept } from '../types/vocabulary';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';

type PracticeMode = 'listen' | 'speak';

interface PinyinPageProps {
  store: VocabularyStore;
  settingsStore: SettingsStore;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Listen Mode (Audio Quiz) ────────────────────────────────────

interface ListenState {
  word: Concept;
  options: Concept[];
  correctIndex: number;
  selectedIndex: number | null;
  showResult: boolean;
}

function ListenQuiz({ store, settings }: { store: VocabularyStore; settings: SettingsStore['settings'] }) {
  const [state, setState] = useState<ListenState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const ttsSupported = isTTSSupported();

  const availableWords = useMemo(() => {
    return store.concepts.filter(c => !c.paused);
  }, [store.concepts]);

  const generateQuestion = useCallback(() => {
    if (availableWords.length < 4) return;

    const shuffled = shuffleArray(availableWords);
    const target = shuffled[0];

    // Pick 5 distractors with different pinyin
    const distractors = shuffled
      .slice(1)
      .filter(w => w.pinyin !== target.pinyin)
      .slice(0, 5);

    if (distractors.length < 3) return;

    const optionCount = Math.min(6, distractors.length + 1);
    const selectedDistractors = distractors.slice(0, optionCount - 1);

    const options = shuffleArray([target, ...selectedDistractors]);
    const correctIndex = options.findIndex(o => o.id === target.id);

    setState({
      word: target,
      options,
      correctIndex,
      selectedIndex: null,
      showResult: false,
    });
  }, [availableWords]);

  useEffect(() => {
    if (availableWords.length >= 4 && !state) {
      generateQuestion();
    }
  }, [availableWords.length, state, generateQuestion]);

  const playAudio = useCallback(async () => {
    if (!state || !ttsSupported) return;
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    try {
      await speak(state.word.word, {
        voiceId: settings?.audio ? getVoiceForCurrentBrowser(settings.audio) : undefined,
        rate: settings?.audio?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setIsPlaying(false);
    }
  }, [state, ttsSupported, isPlaying, settings?.audio]);

  // Auto-play audio when question changes
  const prevWordId = useRef<string | null>(null);
  useEffect(() => {
    if (state && state.word.id !== prevWordId.current) {
      prevWordId.current = state.word.id;
      if (ttsSupported) {
        setIsPlaying(true);
        speak(state.word.word, {
          voiceId: settings?.audio ? getVoiceForCurrentBrowser(settings.audio) : undefined,
          rate: settings?.audio?.speechRate ?? 0.9,
        }).catch(() => {}).finally(() => setIsPlaying(false));
      }
    }
  }, [state?.word.id, ttsSupported, settings?.audio]);

  const handleSelect = useCallback((index: number) => {
    if (!state || state.showResult) return;
    const correct = index === state.correctIndex;
    setState(prev => prev ? { ...prev, selectedIndex: index, showResult: true } : null);
    setStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));
  }, [state]);

  const handleNext = useCallback(() => {
    generateQuestion();
  }, [generateQuestion]);

  if (availableWords.length < 4) {
    return <NeedMoreWords minWords={4} />;
  }

  if (!state) return null;

  return (
    <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col overflow-auto">
      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4 text-sm text-base-content/60">
        <span>{stats.total > 0 ? `${stats.correct}/${stats.total} correct` : 'Listen and pick the matching pinyin'}</span>
        <button className="btn btn-xs btn-ghost" onClick={() => setStats({ correct: 0, total: 0 })}>
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      {/* Audio player */}
      <div className="card bg-base-200 shadow-xl border border-base-300 mb-4">
        <div className="card-body items-center py-8">
          <button
            className={`btn btn-circle btn-lg ${isPlaying ? 'btn-error' : 'btn-primary'}`}
            onClick={playAudio}
            disabled={!ttsSupported}
          >
            {isPlaying ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Volume2 className="w-8 h-8" />
            )}
          </button>
          <p className="text-base-content/60 mt-2 text-sm">Tap to hear the word</p>
        </div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        {state.options.map((option, index) => {
          const isSelected = state.selectedIndex === index;
          const isCorrect = index === state.correctIndex;
          const showCorrect = state.showResult && isCorrect;
          const showWrong = state.showResult && isSelected && !isCorrect;

          return (
            <button
              key={option.id}
              className={`btn h-auto min-h-16 py-3 px-4 flex-col gap-1 text-wrap
                ${!state.showResult ? 'btn-outline hover:btn-primary' : ''}
                ${showCorrect ? 'btn-success' : ''}
                ${showWrong ? 'btn-error' : ''}
                ${state.showResult && !isSelected && !isCorrect ? 'btn-ghost opacity-50' : ''}
              `}
              onClick={() => handleSelect(index)}
              disabled={state.showResult}
            >
              <span className="pinyin text-lg">{option.pinyin}</span>
            </button>
          );
        })}
      </div>

      {/* Result feedback */}
      {state.showResult && (
        <div className="mt-4 space-y-3">
          <div className={`alert ${state.selectedIndex === state.correctIndex ? 'alert-success' : 'alert-info'}`}>
            <div className="flex flex-col gap-1">
              <span className="font-bold hanzi text-lg">
                {state.word.word} · <span className="pinyin">{state.word.pinyin}</span>
              </span>
              <span className="text-sm opacity-80">{state.word.meaning}</span>
            </div>
          </div>

          <button className="btn btn-primary w-full" onClick={handleNext}>
            <ChevronRight className="w-5 h-5" /> Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Speak Mode (Self-Evaluation) ────────────────────────────────

function SpeakPractice({ store, settings }: { store: VocabularyStore; settings: SettingsStore['settings'] }) {
  const [currentWord, setCurrentWord] = useState<Concept | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);
  const [stats, setStats] = useState({ good: 0, retry: 0, total: 0 });
  const ttsSupported = isTTSSupported();

  const availableWords = useMemo(() => {
    return store.concepts.filter(c => !c.paused);
  }, [store.concepts]);

  const pickNextWord = useCallback(() => {
    if (availableWords.length === 0) return;
    const idx = Math.floor(Math.random() * availableWords.length);
    setCurrentWord(availableWords[idx]);
    setHasPlayed(false);
    setShowCharacter(false);
    setShowMeaning(false);
  }, [availableWords]);

  useEffect(() => {
    if (availableWords.length > 0 && !currentWord) {
      pickNextWord();
    }
  }, [availableWords.length, currentWord, pickNextWord]);

  const playAudio = useCallback(async () => {
    if (!currentWord || !ttsSupported) return;
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    setHasPlayed(true);
    try {
      await speak(currentWord.word, {
        voiceId: settings?.audio ? getVoiceForCurrentBrowser(settings.audio) : undefined,
        rate: settings?.audio?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setIsPlaying(false);
    }
  }, [currentWord, ttsSupported, isPlaying, settings?.audio]);

  const handleSelfEval = useCallback((good: boolean) => {
    setStats(prev => ({
      good: prev.good + (good ? 1 : 0),
      retry: prev.retry + (good ? 0 : 1),
      total: prev.total + 1,
    }));
    pickNextWord();
  }, [pickNextWord]);

  if (availableWords.length === 0) {
    return <NeedMoreWords minWords={1} />;
  }

  if (!currentWord) return null;

  return (
    <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col overflow-auto">
      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4 text-sm text-base-content/60">
        <span>
          {stats.total > 0
            ? `${stats.good} good · ${stats.retry} retry`
            : 'Try to say the pinyin, then check with audio'}
        </span>
        <button className="btn btn-xs btn-ghost" onClick={() => setStats({ good: 0, retry: 0, total: 0 })}>
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      {/* Pinyin display */}
      <div className="card bg-base-200 shadow-xl border border-base-300 mb-4">
        <div className="card-body items-center gap-4 py-8">
          <div className="pinyin text-4xl sm:text-5xl text-secondary font-medium">
            {currentWord.pinyin}
          </div>

          {/* Toggleable character */}
          <button
            className="btn btn-sm btn-ghost gap-1.5"
            onClick={() => setShowCharacter(!showCharacter)}
          >
            {showCharacter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showCharacter ? 'Hide' : 'Show'} character
          </button>
          {showCharacter && (
            <div className="hanzi text-5xl text-primary font-bold">{currentWord.word}</div>
          )}

          {/* Toggleable meaning */}
          <button
            className="btn btn-sm btn-ghost gap-1.5"
            onClick={() => setShowMeaning(!showMeaning)}
          >
            {showMeaning ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showMeaning ? 'Hide' : 'Show'} meaning
          </button>
          {showMeaning && (
            <p className="text-lg text-base-content/80">{currentWord.meaning}</p>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center mb-4">
        <p className="text-base-content/50 text-sm">
          {!hasPlayed
            ? '1. Try to say it out loud, then tap Play to check'
            : 'How did you do?'}
        </p>
      </div>

      {/* Play button */}
      <div className="flex justify-center mb-6">
        <button
          className={`btn btn-circle btn-lg ${isPlaying ? 'btn-error' : 'btn-info'}`}
          onClick={playAudio}
          disabled={!ttsSupported}
        >
          {isPlaying ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <Volume2 className="w-8 h-8" />
          )}
        </button>
      </div>

      {/* Self-eval buttons (appear after playing audio) */}
      {hasPlayed && (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="btn btn-outline btn-warning gap-2 h-14"
            onClick={() => handleSelfEval(false)}
          >
            <ThumbsDown className="w-5 h-5" />
            Try Again
          </button>
          <button
            className="btn btn-success gap-2 h-14"
            onClick={() => handleSelfEval(true)}
          >
            <ThumbsUp className="w-5 h-5" />
            Got It
          </button>
        </div>
      )}

      {/* Skip without eval */}
      {!hasPlayed && (
        <div className="flex justify-center">
          <button className="btn btn-ghost btn-sm gap-1" onClick={pickNextWord}>
            <ChevronRight className="w-4 h-4" /> Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared: Need More Words ─────────────────────────────────────

function NeedMoreWords({ minWords }: { minWords: number }) {
  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-lg mx-auto">
        <div className="card bg-base-200">
          <div className="card-body items-center text-center py-10">
            <div className="text-6xl mb-4">🎤</div>
            <h2 className="text-2xl font-bold">Need More Words</h2>
            <p className="text-base-content/60 mt-2 max-w-xs">
              Mark at least {minWords} word{minWords > 1 ? 's' : ''} as known in Vocabulary to start practicing pronunciation.
            </p>
            <Link to="/vocab" className="btn btn-primary mt-6 gap-2">
              <BookOpen className="w-5 h-5" />
              Go to Vocabulary
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export function PinyinPage({ store, settingsStore }: PinyinPageProps) {
  const [mode, setMode] = useState<PracticeMode>('listen');
  const settings = settingsStore.settings;

  const modes: { id: PracticeMode; icon: typeof Headphones; label: string }[] = [
    { id: 'listen', icon: Headphones, label: 'Listen' },
    { id: 'speak', icon: Mic, label: 'Speak' },
  ];

  return (
    <div className="h-full bg-gradient-to-b from-base-100 to-base-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3">
        <h1 className="text-xl font-bold mb-2">Pinyin Practice</h1>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-base-200 rounded-lg p-1">
          {modes.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-sm font-medium transition-all ${
                mode === id
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
              onClick={() => setMode(id)}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      {mode === 'listen' && <ListenQuiz store={store} settings={settings} />}
      {mode === 'speak' && <SpeakPractice store={store} settings={settings} />}
    </div>
  );
}
