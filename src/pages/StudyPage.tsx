import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, ChevronLeft, ChevronRight, Shuffle, Loader2, BookOpen, HelpCircle, Square, CheckSquare, Zap, X } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { TodayFilterStore } from '../stores/todayFilterStore';
import type { Concept } from '../types/vocabulary';
import type { FocusLevel } from '../types/settings';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';

interface StudyPageProps {
  store: VocabularyStore;
  settingsStore?: SettingsStore;
  todayFilter?: TodayFilterStore;
  onShowHelp?: () => void;
}

// Field types that can be revealed/hidden
type RevealField = 'character' | 'pinyin' | 'meaning' | 'audio';

// Convert focus level (0-3) to weight for probability calculation
function focusToWeight(level: FocusLevel): number {
  const weightMap: Record<FocusLevel, number> = {
    0: 0,
    1: 15,
    2: 35,
    3: 50,
  };
  return weightMap[level];
}

interface FlashcardState {
  revealed: Record<Exclude<RevealField, 'audio'>, boolean> & { audio: boolean };
  initiallyRevealed: RevealField;
}

// Pick which field to reveal based on weights
function pickRevealedField(weights: Record<RevealField, number>): RevealField {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  
  for (const [field, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      return field as RevealField;
    }
  }
  return 'pinyin';
}

// Shuffle array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function StudyPage({ store, settingsStore, todayFilter, onShowHelp }: StudyPageProps) {
  // Session words - randomly selected from studying words
  const [sessionWords, setSessionWords] = useState<Concept[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardStates, setCardStates] = useState<Map<string, FlashcardState>>(new Map());
  
  // TTS state
  const [isPlaying, setIsPlaying] = useState(false);
  const ttsSupported = isTTSSupported();
  
  // Get settings with defaults
  const settings = settingsStore?.settings;
  const cardsPerSession = settings?.cardsPerSession ?? 10;
  const shuffleMode = settings?.shuffleMode ?? true;
  
  // Build reveal weights from settings
  const revealWeights = useMemo((): Record<RevealField, number> => {
    if (!settings) {
      return {
        pinyin: 50,
        meaning: 35,
        character: 15,
        audio: 0,
      };
    }
    return {
      character: focusToWeight(settings.learningFocus.character),
      pinyin: focusToWeight(settings.learningFocus.pinyin),
      meaning: focusToWeight(settings.learningFocus.meaning),
      audio: focusToWeight(settings.learningFocus.audio),
    };
  }, [settings]);
  
  // Get words for study, applying today-filter if active
  const studyWords = useMemo(() => {
    let words = store.concepts.filter(c => !c.paused);
    if (todayFilter?.active) {
      if (todayFilter.filter.pos !== 'all') {
        words = words.filter(c => c.part_of_speech === todayFilter.filter.pos);
      }
      if (todayFilter.filter.chapter !== 'all') {
        const ch = parseInt(todayFilter.filter.chapter);
        words = words.filter(c => c.chapter === ch);
      }
    }
    return words;
  }, [store.concepts, todayFilter?.active, todayFilter?.filter.pos, todayFilter?.filter.chapter]);

  // Initialize a new study session
  const startNewSession = useCallback(() => {
    const wordList = shuffleMode ? shuffleArray(studyWords) : studyWords;
    const selected = wordList.slice(0, cardsPerSession);
    setSessionWords(selected);
    setCurrentIndex(0);
    
    // Initialize card states with random reveal for each word
    const newStates = new Map<string, FlashcardState>();
    selected.forEach(word => {
      const revealField = pickRevealedField(revealWeights);
      newStates.set(word.id, {
        revealed: {
          character: revealField === 'character',
          pinyin: revealField === 'pinyin',
          meaning: revealField === 'meaning',
          audio: true,
        },
        initiallyRevealed: revealField,
      });
    });
    setCardStates(newStates);
  }, [studyWords, cardsPerSession, shuffleMode, revealWeights]);

  // Start session on mount or when words change
  useEffect(() => {
    if (studyWords.length > 0 && sessionWords.length === 0) {
      startNewSession();
    }
  }, [studyWords, sessionWords.length, startNewSession]);

  // Current word
  const currentWord = sessionWords[currentIndex];
  const currentState = currentWord ? cardStates.get(currentWord.id) : null;

  // Toggle reveal state for a field
  const toggleReveal = useCallback((field: RevealField) => {
    if (!currentWord) return;
    
    setCardStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(currentWord.id);
      if (current) {
        newStates.set(currentWord.id, {
          ...current,
          revealed: {
            ...current.revealed,
            [field]: !current.revealed[field],
          },
        });
      }
      return newStates;
    });
  }, [currentWord]);

  // Reveal all text fields
  const revealAll = useCallback(() => {
    if (!currentWord) return;
    
    setCardStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(currentWord.id);
      if (current) {
        newStates.set(currentWord.id, {
          ...current,
          revealed: {
            character: true,
            pinyin: true,
            meaning: true,
            audio: true,
          },
        });
      }
      return newStates;
    });
  }, [currentWord]);

  // Check if all text fields are revealed
  const allRevealed = currentState && 
    currentState.revealed.character && 
    currentState.revealed.pinyin && 
    currentState.revealed.meaning;

  // Navigation - wrap around for unlimited study
  const goNext = useCallback(() => {
    if (sessionWords.length > 0) {
      setCurrentIndex(prev => (prev + 1) % sessionWords.length);
    }
  }, [sessionWords.length]);

  const goPrev = useCallback(() => {
    if (sessionWords.length > 0) {
      setCurrentIndex(prev => (prev - 1 + sessionWords.length) % sessionWords.length);
    }
  }, [sessionWords.length]);

  // Handle audio play
  const handlePlayAudio = useCallback(async () => {
    if (!currentWord || !ttsSupported) return;
    
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      return;
    }
    
    setIsPlaying(true);
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

  // Auto-play audio when card changes (if enabled)
  const prevWordIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentWordId = currentWord?.id ?? null;
    const prevWordId = prevWordIdRef.current;
    prevWordIdRef.current = currentWordId;
    
    if (currentWordId && currentWordId !== prevWordId && settings?.autoPlayAudio && ttsSupported) {
      handlePlayAudio();
    }
  }, [currentWord?.id, settings?.autoPlayAudio, ttsSupported, handlePlayAudio]);

  // Stop audio when changing cards
  useEffect(() => {
    return () => {
      if (ttsSupported) {
        stopSpeaking();
      }
    };
  }, [currentIndex, ttsSupported]);

  const isAudioAvailable = ttsSupported;

  // No words to study
  if (studyWords.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-base-100/95 backdrop-blur border-b border-base-300 px-4 py-3">
          <h1 className="text-xl font-bold text-center">Study</h1>
        </header>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-lg mx-auto">
            <div className="card bg-base-200">
              <div className="card-body items-center text-center py-10">
                {todayFilter?.active ? (
                  <>
                    <div className="text-6xl mb-4">🔍</div>
                    <h2 className="text-2xl font-bold">No matching words</h2>
                    <p className="text-base-content/60 mt-2 max-w-xs">
                      No known words match your filter: <span className="font-semibold text-info">{todayFilter.label}</span>
                    </p>
                    <button
                      className="btn btn-primary mt-6 gap-2"
                      onClick={todayFilter.clear}
                    >
                      <X className="w-5 h-5" />
                      Clear filter
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-6xl mb-4">📚</div>
                    <h2 className="text-2xl font-bold">No Words Yet</h2>
                    <p className="text-base-content/60 mt-2 max-w-xs">
                      Import some vocabulary first to start studying!
                    </p>
                    <Link 
                      to="/vocab"
                      className="btn btn-primary mt-6 gap-2"
                    >
                      <BookOpen className="w-5 h-5" />
                      Go to Vocabulary
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main flashcard view
  return (
    <div className="h-full bg-gradient-to-b from-base-100 to-base-200 flex flex-col overflow-hidden">
      {/* Today-filter banner */}
      {todayFilter?.active && (
        <div className="flex-shrink-0 bg-info/10 border-b border-info/30 px-4 py-1.5">
          <div className="flex items-center justify-center gap-2 text-sm">
            <Zap className="w-3.5 h-3.5 text-info" />
            <span className="font-medium text-info">{todayFilter.label}</span>
            <span className="text-base-content/50">for today</span>
            <button
              className="btn btn-ghost btn-xs btn-circle ml-1"
              onClick={() => { todayFilter.clear(); startNewSession(); }}
              title="Reset to full vocab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Study</h1>
          <div className="flex items-center gap-2">
            {onShowHelp && (
              <button
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={onShowHelp}
                title="Help & Guide"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
            <button 
              className="btn btn-sm btn-ghost"
              onClick={startNewSession}
              title="Shuffle new words"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Flashcard */}
      <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col justify-center min-h-0">
        {currentWord && currentState && (
          <div className="card bg-base-200 shadow-xl border border-base-300">
            <div className="card-body gap-4 py-5 px-5">
              
              {/* Character Section */}
              <div 
                className="cursor-pointer select-none"
                onClick={() => toggleReveal('character')}
              >
                <span className="text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1 block">
                  Character
                </span>
                <div className={`
                  text-center h-24 flex items-center justify-center rounded-xl transition-all duration-300
                  ${currentState.revealed.character 
                    ? 'bg-primary/10 border-2 border-primary/30' 
                    : 'bg-base-300 border-2 border-dashed border-base-content/20 hover:border-primary/40'}
                `}>
                  {currentState.revealed.character ? (
                    <span className="hanzi hanzi-scalable font-bold text-primary">
                      {currentWord.word}
                    </span>
                  ) : (
                    <span className="text-4xl text-base-content/20">?</span>
                  )}
                </div>
              </div>

              {/* Pinyin Section */}
              <div 
                className="cursor-pointer select-none"
                onClick={() => toggleReveal('pinyin')}
              >
                <span className="text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1 block">
                  Pinyin
                </span>
                <div className={`
                  text-center h-16 flex items-center justify-center rounded-xl transition-all duration-300
                  ${currentState.revealed.pinyin 
                    ? 'bg-secondary/10 border-2 border-secondary/30' 
                    : 'bg-base-300 border-2 border-dashed border-base-content/20 hover:border-secondary/40'}
                `}>
                  {currentState.revealed.pinyin ? (
                    <span className="pinyin text-2xl text-secondary">
                      {currentWord.pinyin}
                    </span>
                  ) : (
                    <span className="text-3xl text-base-content/20">?</span>
                  )}
                </div>
              </div>

              {/* Meaning Section */}
              <div 
                className="cursor-pointer select-none"
                onClick={() => toggleReveal('meaning')}
              >
                <span className="text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1 block">
                  Meaning
                </span>
                <div className={`
                  text-center h-16 flex items-center justify-center rounded-xl transition-all duration-300
                  ${currentState.revealed.meaning 
                    ? 'bg-accent/10 border-2 border-accent/30' 
                    : 'bg-base-300 border-2 border-dashed border-base-content/20 hover:border-accent/40'}
                `}>
                  {currentState.revealed.meaning ? (
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-medium leading-tight">{currentWord.meaning}</p>
                      <p className="text-xs text-base-content/60">
                        {currentWord.part_of_speech} · Ch. {currentWord.chapter}
                      </p>
                    </div>
                  ) : (
                    <span className="text-3xl text-base-content/20">?</span>
                  )}
                </div>
              </div>

              {/* Audio Section */}
              <div>
                <span className="text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1 block">
                  Audio
                </span>
                <div className="text-center h-16 flex items-center justify-center rounded-xl bg-info/10 border-2 border-info/30">
                  <button
                    className={`btn btn-circle btn-lg ${isAudioAvailable ? (isPlaying ? 'btn-error' : 'btn-info') : 'btn-ghost opacity-40 cursor-not-allowed'}`}
                    onClick={() => isAudioAvailable && handlePlayAudio()}
                    disabled={!isAudioAvailable}
                    title={!isAudioAvailable ? 'TTS not supported' : isPlaying ? 'Stop' : 'Play pronunciation'}
                  >
                    {isPlaying ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Volume2 className="w-6 h-6" />
                    )}
                  </button>
                </div>
              </div>

              {/* Actions row: Show all + Known toggle */}
              <div className="flex items-center justify-between gap-2">
                <button 
                  className={`btn btn-xs btn-ghost ${allRevealed ? 'opacity-30 cursor-not-allowed' : 'text-base-content/50'}`}
                  onClick={revealAll}
                  disabled={!!allRevealed}
                >
                  Show all
                </button>
                
                {/* Known/Unknown toggle - checkbox style */}
                {(() => {
                  // Get current paused state from store (reactive)
                  const currentConcept = store.concepts.find(c => c.id === currentWord.id);
                  const isPaused = currentConcept?.paused ?? false;
                  
                  return (
                    <button
                      className={`btn btn-sm gap-1.5 ${
                        isPaused 
                          ? 'btn-outline btn-warning' 
                          : 'btn-success'
                      }`}
                      onClick={() => store.togglePaused(currentWord.id)}
                      title={isPaused ? 'Click to mark as known (include in quiz)' : 'Click to mark as unknown (exclude from quiz)'}
                    >
                      {isPaused ? (
                        <>
                          <Square className="w-4 h-4" />
                          <span>Unknown</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4" />
                          <span>Known</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Navigation - simple prev/next */}
        <div className="flex items-center justify-center gap-6 mt-4 shrink-0">
          <button 
            className="btn btn-circle btn-lg btn-primary btn-outline"
            onClick={goPrev}
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <button 
            className="btn btn-circle btn-lg btn-primary"
            onClick={goNext}
            title="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Hint text */}
        <p className="text-center text-xs text-base-content/40 mt-3 shrink-0">
          Tap any section to reveal/hide
        </p>
      </div>
    </div>
  );
}
