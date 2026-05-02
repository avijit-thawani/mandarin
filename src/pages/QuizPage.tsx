import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, BookOpen, HelpCircle, Loader2, Check, X, Zap, Square, CheckSquare, Settings2, Ban } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { TodayFilterStore } from '../stores/todayFilterStore';
import type { QuizSession, QuizQuestion, Modality, Concept } from '../types/vocabulary';
import type { SentenceExercise } from '../types/syntax';
import { generateQuizSession, getModalityContent, modalityNeedsAudio } from '../utils/quiz';
import { generateSentenceExercise, checkSyntaxUnlock } from '../utils/syntax';
import { predictCorrect, computeModalityAverages } from '../utils/knowledge';
import { saveQuizAttempt, buildQuizContext } from '../lib/quizService';
import { clearNotifications } from '../lib/pwaReminderService';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';
import { useAuth } from '../hooks/useAuth';
import { OPTION_SELECTION_META, QUESTION_SELECTION_META, SYNTAX_FREQUENCY_META } from '../types/settings';
import type { QuestionSelection, OptionSelection, FocusLevel } from '../types/settings';
import { SyntaxExerciseCard } from '../components/SyntaxExerciseCard';

// Daily quiz completion tracking
const QUIZ_COMPLETION_KEY = 'langseed_quiz_completed';

export function hasCompletedQuizToday(): boolean {
  const lastCompleted = localStorage.getItem(QUIZ_COMPLETION_KEY);
  if (!lastCompleted) return false;
  
  const today = new Date().toDateString();
  return lastCompleted === today;
}

function markQuizCompletedToday() {
  localStorage.setItem(QUIZ_COMPLETION_KEY, new Date().toDateString());
}

// Confetti celebration
async function fireConfetti() {
  try {
    const confettiModule = await import('canvas-confetti');
    const confetti = confettiModule.default;
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  } catch (err) {
    console.error('Confetti error:', err);
  }
}

// Mixed session item: either MCQ or syntax
type QuizItem =
  | { type: 'mcq'; questionIndex: number }
  | { type: 'syntax'; exercise: SentenceExercise };

function buildMixedSession(
  mcqCount: number,
  syntaxExercises: SentenceExercise[],
): QuizItem[] {
  const items: QuizItem[] = [];
  for (let i = 0; i < mcqCount; i++) {
    items.push({ type: 'mcq', questionIndex: i });
  }
  for (const ex of syntaxExercises) {
    items.push({ type: 'syntax', exercise: ex });
  }
  // Interleave: shuffle syntax positions among the MCQ items
  // Fisher-Yates on the full array
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

interface QuizPageProps {
  store: VocabularyStore;
  settingsStore: SettingsStore;
  todayFilter?: TodayFilterStore;
  onShowHelp?: () => void;
  onStreakRefresh?: () => void;
}

export function QuizPage({ store, settingsStore, todayFilter, onShowHelp, onStreakRefresh }: QuizPageProps) {
  const auth = useAuth();
  const settings = settingsStore.settings;
  const cardsPerSession = settings.cardsPerSession;
  // Handle migration from old settings (difficulty/selectionStrategy -> optionSelection/questionSelection)
  const rawQuiz = settings.quiz as {
    questionSelection?: string;
    optionSelection?: string;
    difficulty?: string;       // Legacy
    selectionStrategy?: string; // Legacy
  } | undefined;
  const quizSettings = {
    questionSelection: (rawQuiz?.questionSelection ?? rawQuiz?.selectionStrategy ?? 'random') as QuestionSelection,
    optionSelection: (rawQuiz?.optionSelection ?? rawQuiz?.difficulty ?? 'hard') as OptionSelection,
  };
  
  // Syntax settings
  const syntaxFrequency = (settings.syntax?.frequency ?? 1) as FocusLevel;
  const syntaxDirectionRatio = settings.syntax?.directionRatio ?? 1;

  // Quiz state
  const [session, setSession] = useState<QuizSession | null>(null);
  const [mixedItems, setMixedItems] = useState<QuizItem[]>([]);
  const [mixedIndex, setMixedIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewedAudioOption, setPreviewedAudioOption] = useState<number | null>(null);
  const [playingOptionIndex, setPlayingOptionIndex] = useState<number | null>(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  
  // Pending answer - deferred logging until user confirms or skips
  const [pendingAnswer, setPendingAnswer] = useState<{
    index: number;
    correct: boolean;
    mcqIndex: number;
  } | null>(null);
  
  // Syntax answer tracking (separate from MCQ)
  const [syntaxAnswers, setSyntaxAnswers] = useState<Array<{ correct: boolean }>>([]);
  
  const ttsSupported = isTTSSupported();
  
  // Compute user averages for context logging
  const userAverages = useMemo(() => {
    return computeModalityAverages(store.concepts.filter(c => !c.paused));
  }, [store.concepts]);
  
  // Get available words for quiz, applying today-filter if active
  const availableWords = useMemo(() => {
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
  
  // Current item in mixed session
  const currentItem: QuizItem | null = mixedItems[mixedIndex] ?? null;
  const currentMcqIndex = currentItem?.type === 'mcq' ? currentItem.questionIndex : -1;
  const currentQuestion: QuizQuestion | null = currentMcqIndex >= 0 ? (session?.questions[currentMcqIndex] ?? null) : null;
  const isSessionComplete = mixedItems.length > 0 && mixedIndex >= mixedItems.length;
  
  // Session stats (MCQ + syntax combined)
  const sessionStats = useMemo(() => {
    const mcqCorrect = session?.answers.filter(a => a.correct).length ?? 0;
    const mcqTotal = session?.answers.length ?? 0;
    const synCorrect = syntaxAnswers.filter(a => a.correct).length;
    const synTotal = syntaxAnswers.length;
    return {
      correct: mcqCorrect + synCorrect,
      total: mcqTotal + synTotal,
    };
  }, [session?.answers, syntaxAnswers]);
  
  // Start a new quiz session (mixed MCQ + syntax)
  const startNewSession = useCallback(() => {
    if (availableWords.length === 0) return;
    
    // Determine syntax count based on frequency setting
    const syntaxFrac = SYNTAX_FREQUENCY_META[syntaxFrequency].fraction;
    const unlockStatus = checkSyntaxUnlock(availableWords);
    const canDoSyntax = syntaxFrequency > 0 && unlockStatus.unlocked;
    const syntaxCount = canDoSyntax ? Math.max(0, Math.round(cardsPerSession * syntaxFrac)) : 0;
    const mcqCount = cardsPerSession - syntaxCount;
    
    // Generate MCQ questions
    const newSession = generateQuizSession(
      availableWords,
      mcqCount,
      settings.learningFocus,
      quizSettings.questionSelection,
      quizSettings.optionSelection
    );
    
    // Generate syntax exercises
    const syntaxExercises: SentenceExercise[] = [];
    if (syntaxCount > 0) {
      for (let i = 0; i < syntaxCount; i++) {
        const ex = generateSentenceExercise(availableWords, settings.learningFocus, syntaxDirectionRatio);
        if (ex) syntaxExercises.push(ex);
      }
    }
    
    // Build mixed session
    const items = buildMixedSession(mcqCount, syntaxExercises);
    
    setSession(newSession);
    setMixedItems(items);
    setMixedIndex(0);
    setSyntaxAnswers([]);
    setSelectedOption(null);
    setShowResult(false);
  }, [availableWords, cardsPerSession, settings.learningFocus, quizSettings.questionSelection, quizSettings.optionSelection, syntaxFrequency, syntaxDirectionRatio]);
  
  // Auto-start session on mount
  useEffect(() => {
    if (availableWords.length > 0 && !session) {
      startNewSession();
    }
  }, [availableWords.length, session, startNewSession]);
  
  // Play audio for question (if audio modality)
  const playQuestionAudio = useCallback(async () => {
    if (!currentQuestion || !ttsSupported) return;
    
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      return;
    }
    
    const word = currentQuestion.concept.word;
    setIsPlaying(true);
    try {
      await speak(word, {
        voiceId: settings?.audio ? getVoiceForCurrentBrowser(settings.audio) : undefined,
        rate: settings?.audio?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setIsPlaying(false);
    }
  }, [currentQuestion, ttsSupported, isPlaying, settings?.audio]);
  
  // Play audio for an answer option (for audio answer modality)
  const playOptionAudio = useCallback(async (option: Concept, index: number) => {
    if (!ttsSupported) return;
    
    // Stop any currently playing audio
    stopSpeaking();
    
    setPlayingOptionIndex(index);
    setPreviewedAudioOption(index);
    
    try {
      await speak(option.word, {
        voiceId: settings?.audio ? getVoiceForCurrentBrowser(settings.audio) : undefined,
        rate: settings?.audio?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setPlayingOptionIndex(null);
    }
  }, [ttsSupported, settings?.audio]);
  
  // Reset previewed option when question changes
  useEffect(() => {
    setPreviewedAudioOption(null);
    setPlayingOptionIndex(null);
  }, [currentQuestion?.concept.id]);
  
  // Handle option selection - just show result, defer logging until user confirms
  const handleSelectOption = useCallback((index: number) => {
    if (showResult || !currentQuestion || !session) return;
    
    const correct = index === currentQuestion.correctIndex;
    setSelectedOption(index);
    setShowResult(true);
    
    // Store pending answer - will be logged when user clicks Next (or skipped if they click "Don't log")
    setPendingAnswer({ index, correct, mcqIndex: currentMcqIndex });
  }, [showResult, currentQuestion, session, currentMcqIndex]);
  
  // Commit the pending answer to store and Supabase
  const commitPendingAnswer = useCallback(() => {
    if (!pendingAnswer || !currentQuestion || !session) return;
    
    const { index, correct } = pendingAnswer;
    
    // Update session answers
    const { mcqIndex } = pendingAnswer;
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: [...prev.answers, {
          questionIndex: mcqIndex,
          selectedIndex: index,
          correct,
          timestamp: new Date().toISOString(),
        }],
      };
    });
    
    // Update modality knowledge in store (both question and answer modalities)
    store.updateModalityKnowledge(
      currentQuestion.concept.id,
      currentQuestion.questionModality,
      currentQuestion.answerModality,
      correct,
      settings.learningFocus
    );
    
    // Save to Supabase (async, non-blocking)
    if (auth.user) {
      const predicted = predictCorrect(currentQuestion.concept, currentQuestion.answerModality);
      
      // Build context for ML logging
      const distractors = currentQuestion.options.filter(o => o.id !== currentQuestion.concept.id);
      const context = buildQuizContext(
        currentQuestion.concept,
        currentQuestion.questionModality,
        currentQuestion.answerModality,
        distractors,
        userAverages,
        quizSettings.questionSelection,
        quizSettings.optionSelection
      );
      
      saveQuizAttempt(
        auth.user.id,
        currentQuestion.concept.id,
        currentQuestion.questionModality,
        currentQuestion.answerModality,
        currentQuestion.options.map(o => o.id) as [string, string, string, string],
        index as 0 | 1 | 2 | 3,
        correct,
        predicted,
        context
      );
    }
    
    // Clear pending answer
    setPendingAnswer(null);
  }, [pendingAnswer, currentQuestion, session, store, settings.learningFocus, auth.user, userAverages, quizSettings]);
  
  // Handle session completion (shared between MCQ and syntax paths)
  const handleSessionComplete = useCallback((allMcqAnswers: Array<{ correct: boolean }>, allSyntaxAnswers: Array<{ correct: boolean }>) => {
    const totalCorrect = allMcqAnswers.filter(a => a.correct).length + allSyntaxAnswers.filter(a => a.correct).length;
    const totalCount = allMcqAnswers.length + allSyntaxAnswers.length;
    store.recordProgressSnapshot(totalCount, totalCorrect);
    markQuizCompletedToday();
    clearNotifications();
    onStreakRefresh?.();
    if (totalCorrect > totalCount * 0.6) {
      fireConfetti();
    }
  }, [store, onStreakRefresh]);

  // Go to next question (commits the pending MCQ answer first)
  const goToNext = useCallback(() => {
    if (!session) return;
    
    // Commit the pending answer before moving on
    commitPendingAnswer();
    
    const nextMixed = mixedIndex + 1;
    const isLast = nextMixed >= mixedItems.length;
    
    if (isLast) {
      // Session complete
      const answersAfterCommit = pendingAnswer 
        ? [...session.answers, { correct: pendingAnswer.correct }]
        : session.answers;
      handleSessionComplete(answersAfterCommit, syntaxAnswers);
      setSession(prev => prev ? { ...prev, completedAt: new Date().toISOString() } : prev);
    }
    
    setMixedIndex(nextMixed);
    setSelectedOption(null);
    setShowResult(false);
  }, [session, commitPendingAnswer, pendingAnswer, mixedIndex, mixedItems, syntaxAnswers, handleSessionComplete]);
  
  // Skip logging and go to next question
  const skipAndNext = useCallback(() => {
    if (!session) return;
    
    // Clear pending answer without committing (skip logging)
    setPendingAnswer(null);
    
    const nextMixed = mixedIndex + 1;
    const isLast = nextMixed >= mixedItems.length;
    
    if (isLast) {
      handleSessionComplete(session.answers, syntaxAnswers);
      setSession(prev => prev ? { ...prev, completedAt: new Date().toISOString() } : prev);
    }
    
    setMixedIndex(nextMixed);
    setSelectedOption(null);
    setShowResult(false);
  }, [session, mixedIndex, mixedItems, syntaxAnswers, handleSessionComplete]);
  
  // Handle syntax exercise completion
  const handleSyntaxComplete = useCallback((correct: boolean) => {
    const newSyntaxAnswers = [...syntaxAnswers, { correct }];
    setSyntaxAnswers(newSyntaxAnswers);
    
    const nextMixed = mixedIndex + 1;
    const isLast = nextMixed >= mixedItems.length;
    
    if (isLast && session) {
      handleSessionComplete(session.answers, newSyntaxAnswers);
      setSession(prev => prev ? { ...prev, completedAt: new Date().toISOString() } : prev);
    }
    
    setMixedIndex(nextMixed);
    setSelectedOption(null);
    setShowResult(false);
  }, [syntaxAnswers, mixedIndex, mixedItems, session, handleSessionComplete]);

  // Skip a syntax exercise — advance without recording (no impact on stats or knowledge).
  // Syntax exercises require thoughtful tile arrangement; quick guessing isn't an option like MCQ.
  const handleSyntaxSkip = useCallback(() => {
    const nextMixed = mixedIndex + 1;
    const isLast = nextMixed >= mixedItems.length;

    if (isLast && session) {
      handleSessionComplete(session.answers, syntaxAnswers);
      setSession(prev => prev ? { ...prev, completedAt: new Date().toISOString() } : prev);
    }

    setMixedIndex(nextMixed);
    setSelectedOption(null);
    setShowResult(false);
  }, [mixedIndex, mixedItems, session, syntaxAnswers, handleSessionComplete]);

  // Get display content for an option
  const getOptionDisplay = (option: Concept, modality: Modality): string => {
    return getModalityContent(option, modality);
  };
  
  // No words available
  if (availableWords.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-base-100/95 backdrop-blur border-b border-base-300 px-4 py-3">
          <h1 className="text-xl font-bold text-center">Quiz</h1>
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
                    <div className="text-6xl mb-4">🎯</div>
                    <h2 className="text-2xl font-bold">Ready to Learn?</h2>
                    <p className="text-base-content/60 mt-2 max-w-xs">
                      Import some vocabulary first to start quizzing!
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
  
  // Session complete
  if (isSessionComplete && session) {
    const accuracy = sessionStats.total > 0 
      ? Math.round((sessionStats.correct / sessionStats.total) * 100)
      : 0;
    
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-base-100/95 backdrop-blur border-b border-base-300 px-4 py-3">
          <h1 className="text-xl font-bold text-center">Quiz Complete!</h1>
        </header>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-lg mx-auto">
            <div className="card bg-base-200">
              <div className="card-body items-center text-center py-10">
                <div className="text-6xl mb-4">
                  {accuracy >= 80 ? '🎉' : accuracy >= 60 ? '👍' : '💪'}
                </div>
                <h2 className="text-2xl font-bold">
                  {accuracy >= 80 ? 'Excellent!' : accuracy >= 60 ? 'Good Job!' : 'Keep Practicing!'}
                </h2>
                
                {/* Stats */}
                <div className="stats stats-vertical sm:stats-horizontal shadow mt-6 bg-base-100">
                  <div className="stat">
                    <div className="stat-title">Score</div>
                    <div className="stat-value text-primary">{accuracy}%</div>
                    <div className="stat-desc">{sessionStats.correct} / {sessionStats.total} correct</div>
                  </div>
                  
                  <div className="stat">
                    <div className="stat-title">Streak</div>
                    <div className="stat-value text-secondary">
                      {session.answers.reduce((streak, a, i) => {
                        if (a.correct && (i === 0 || session.answers[i-1].correct)) {
                          return streak + 1;
                        }
                        return a.correct ? 1 : 0;
                      }, 0)}
                    </div>
                    <div className="stat-desc">Best run</div>
                  </div>
                </div>
                
                <button 
                  className="btn btn-primary mt-6 gap-2"
                  onClick={startNewSession}
                >
                  <Zap className="w-5 h-5" />
                  Start New Quiz
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Loading state
  if (!session || !currentItem) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Syntax exercise item
  if (currentItem.type === 'syntax') {
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

        <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quiz</h1>
              <span className="text-sm text-base-content/60">
                {mixedIndex + 1}/{mixedItems.length}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>{sessionStats.correct}</span>
            </div>
          </div>
          <progress 
            className="progress progress-primary w-full h-1.5" 
            value={mixedIndex + 1} 
            max={mixedItems.length}
          />
        </header>

        <div className="flex-1 px-3 py-2 max-w-lg mx-auto w-full flex flex-col overflow-auto">
          <SyntaxExerciseCard
            exercise={currentItem.exercise}
            audioSettings={settings.audio}
            onComplete={handleSyntaxComplete}
            onSkip={handleSyntaxSkip}
          />
        </div>
      </div>
    );
  }

  // MCQ item — need a valid question
  if (!currentQuestion) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Main quiz view (MCQ)
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
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quiz</h1>
            <span className="text-sm text-base-content/60">
              {mixedIndex + 1}/{mixedItems.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>{sessionStats.correct}</span>
            </div>
            
            {/* Quiz settings dropdown */}
            <div className="dropdown dropdown-end">
              <button
                tabIndex={0}
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                title="Quiz Settings"
              >
                <Settings2 className="w-5 h-5" />
              </button>
              <div 
                tabIndex={0} 
                className="dropdown-content z-50 card card-compact w-64 p-2 shadow-xl bg-base-200 border border-base-300"
              >
                <div className="card-body gap-3">
                  <h3 className="font-semibold text-sm">Quiz Settings</h3>
                  
                  {/* Question selection */}
                  <div>
                    <label className="text-xs text-base-content/60 mb-1 block">Question Selection</label>
                    <select
                      className="select select-sm select-bordered w-full"
                      value={quizSettings.questionSelection}
                      onChange={(e) => {
                        settingsStore.setQuizSettings({ 
                          questionSelection: e.target.value as QuestionSelection 
                        });
                      }}
                    >
                      {(['random', 'weak', 'leastTested', 'dueReview'] as const).map(strat => {
                        const meta = QUESTION_SELECTION_META[strat];
                        return (
                          <option key={strat} value={strat}>
                            {meta.emoji} {meta.label}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-xs text-base-content/50 mt-1">
                      {QUESTION_SELECTION_META[quizSettings.questionSelection].description}
                    </p>
                  </div>
                  
                  {/* Option selection (distractor difficulty) */}
                  <div>
                    <label className="text-xs text-base-content/60 mb-1 block">Difficulty</label>
                    <div className="flex gap-1">
                      {(['easy', 'hard', 'expert'] as const).map(opt => {
                        const meta = OPTION_SELECTION_META[opt];
                        const isActive = quizSettings.optionSelection === opt;
                        return (
                          <button
                            key={opt}
                            className={`btn btn-sm flex-1 gap-1 ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => {
                              settingsStore.setQuizSettings({ optionSelection: opt });
                            }}
                          >
                            {meta.emoji}
                            <span className="hidden sm:inline">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-base-content/50 mt-1">
                      {OPTION_SELECTION_META[quizSettings.optionSelection].description}
                    </p>
                  </div>
                  
                  <p className="text-xs text-base-content/40 italic">
                    Changes apply to next quiz
                  </p>
                </div>
              </div>
            </div>
            
            {onShowHelp && (
              <button
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={onShowHelp}
                title="Help"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Progress bar */}
        <progress 
          className="progress progress-primary w-full h-1.5" 
          value={mixedIndex + 1} 
          max={mixedItems.length}
        />
      </header>

      {/* Question Card */}
      <div className="flex-1 px-3 py-2 max-w-lg mx-auto w-full flex flex-col overflow-auto">
        <div className="card bg-base-200 shadow-xl border border-base-300">
          <div className="card-body p-4 gap-2">
            {/* Question */}
            <div className="text-center py-2">
              {modalityNeedsAudio(currentQuestion.questionModality) ? (
                // Audio question
                <div className="flex flex-col items-center gap-2">
                  <button
                    className={`btn btn-circle btn-md ${isPlaying ? 'btn-error' : 'btn-primary'}`}
                    onClick={playQuestionAudio}
                    disabled={!ttsSupported}
                  >
                    {isPlaying ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Volume2 className="w-6 h-6" />
                    )}
                  </button>
                  <p className="text-sm text-base-content/60">Tap to hear the word</p>
                </div>
              ) : currentQuestion.questionModality === 'character' ? (
                // Character question
                <div className="hanzi text-5xl font-bold text-primary">
                  {getModalityContent(currentQuestion.concept, 'character')}
                </div>
              ) : currentQuestion.questionModality === 'pinyin' ? (
                // Pinyin question with optional audio
                <div className="flex flex-col items-center gap-1.5">
                  <div className="pinyin text-3xl text-secondary">
                    {getModalityContent(currentQuestion.concept, 'pinyin')}
                  </div>
                  {ttsSupported && (
                    <button
                      className={`btn btn-circle btn-sm ${isPlaying ? 'btn-error' : 'btn-ghost text-base-content/40 hover:text-primary'}`}
                      onClick={playQuestionAudio}
                      title="Listen to pronunciation"
                    >
                      {isPlaying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ) : (
                // Meaning question
                <div className="text-xl font-medium">
                  {getModalityContent(currentQuestion.concept, 'meaning')}
                </div>
              )}
            </div>
            
            {/* Options - 2 cols for 4 options, 3 cols for 6 options */}
            <div className={`grid gap-2 ${currentQuestion.options.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedOption === index;
                const isCorrect = index === currentQuestion.correctIndex;
                const showCorrectHighlight = showResult && isCorrect;
                const showWrongHighlight = showResult && isSelected && !isCorrect;
                const isAudioOption = currentQuestion.answerModality === 'audio';
                const isPreviewed = previewedAudioOption === index;
                const isPlayingThis = playingOptionIndex === index;
                
                const handleClick = () => {
                  if (isAudioOption && !showResult) {
                    playOptionAudio(option, index);
                  } else {
                    handleSelectOption(index);
                  }
                };
                
                return (
                  <button
                    key={option.id}
                    className={`
                      btn h-auto min-h-12 py-2 px-3 flex-col gap-0.5 text-wrap
                      ${!showResult && !isPreviewed ? 'btn-outline hover:btn-primary' : ''}
                      ${!showResult && isPreviewed ? 'btn-primary' : ''}
                      ${showCorrectHighlight ? 'btn-success' : ''}
                      ${showWrongHighlight ? 'btn-error' : ''}
                      ${showResult && !isSelected && !isCorrect ? 'btn-ghost opacity-70' : ''}
                    `}
                    onClick={handleClick}
                    disabled={showResult}
                  >
                    {showResult && isCorrect && (
                      <Check className="w-4 h-4 text-success-content" />
                    )}
                    {showWrongHighlight && (
                      <X className="w-4 h-4 text-error-content" />
                    )}
                    
                    {currentQuestion.answerModality === 'character' ? (
                      <span className="hanzi text-xl">
                        {getOptionDisplay(option, 'character')}
                      </span>
                    ) : currentQuestion.answerModality === 'pinyin' ? (
                      <span className="pinyin text-base">
                        {getOptionDisplay(option, 'pinyin')}
                      </span>
                    ) : currentQuestion.answerModality === 'meaning' ? (
                      <span className="text-sm leading-tight">
                        {getOptionDisplay(option, 'meaning')}
                      </span>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        {isPlayingThis ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                        {isPreviewed && !showResult && (
                          <span className="text-xs opacity-70">✓ Selected</span>
                        )}
                      </div>
                    )}
                    
                    {showResult && (
                      <div className="flex flex-col items-center gap-0 mt-0.5 border-t border-current/10 pt-0.5 w-full">
                        {currentQuestion.answerModality !== 'character' && (
                          <span className="hanzi text-sm">{option.word}</span>
                        )}
                        {currentQuestion.answerModality !== 'pinyin' && (
                          <span className="pinyin text-[11px] opacity-80">{option.pinyin}</span>
                        )}
                        {currentQuestion.answerModality !== 'meaning' && (
                          <span className="text-[11px] opacity-70 leading-tight text-center">{option.meaning}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Submit button for audio options */}
            {currentQuestion.answerModality === 'audio' && previewedAudioOption !== null && !showResult && (
              <button 
                className="btn btn-primary w-full mt-3"
                onClick={() => handleSelectOption(previewedAudioOption)}
              >
                Submit Answer
              </button>
            )}
            
            {/* Result feedback & Next button */}
            {showResult && (() => {
              const currentConcept = store.concepts.find(c => c.id === currentQuestion.concept.id);
              const isPaused = currentConcept?.paused ?? currentQuestion.concept.paused;
              
              return (
                <div className="mt-2 space-y-2">
                  <div className={`alert py-2 ${selectedOption === currentQuestion.correctIndex ? 'alert-success' : 'alert-info'}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-sm">
                        {currentQuestion.concept.word} · {currentQuestion.concept.pinyin}
                      </span>
                      <span className="text-xs opacity-80">
                        {currentQuestion.concept.meaning}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-1.5">
                    <button
                      className={`btn btn-sm flex-shrink-0 gap-1 ${
                        isPaused 
                          ? 'btn-outline btn-warning' 
                          : 'btn-success'
                      }`}
                      onClick={() => store.togglePaused(currentQuestion.concept.id)}
                      title={isPaused ? 'Click to mark as known (include in quiz)' : 'Click to mark as unknown (exclude from quiz)'}
                    >
                      {isPaused ? (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Unknown</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Known</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      className="btn btn-sm btn-ghost btn-square text-base-content/50 hover:text-warning hover:bg-warning/10"
                      onClick={skipAndNext}
                      title="Don't log this attempt — we won't learn from this question (useful if you guessed)"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                    
                    <button 
                      className="btn btn-sm btn-primary flex-1"
                      onClick={goToNext}
                    >
                      {mixedIndex + 1 >= mixedItems.length ? 'See Results' : 'Next'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        
      </div>
    </div>
  );
}
