import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, BookOpen, HelpCircle, Loader2, Check, X, Zap, Square, CheckSquare, Settings2, Ban } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { TodayFilterStore } from '../stores/todayFilterStore';
import type { QuizSession, QuizQuestion, Modality, Concept } from '../types/vocabulary';
import { generateQuizSession, getModalityContent, modalityNeedsAudio } from '../utils/quiz';
import { predictCorrect, computeModalityAverages } from '../utils/knowledge';
import { saveQuizAttempt, buildQuizContext } from '../lib/quizService';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';
import { useAuth } from '../hooks/useAuth';
import { OPTION_SELECTION_META, QUESTION_SELECTION_META } from '../types/settings';
import type { QuestionSelection, OptionSelection } from '../types/settings';

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
  
  // Quiz state
  const [session, setSession] = useState<QuizSession | null>(null);
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
  } | null>(null);
  
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
  
  // Current question
  const currentQuestion: QuizQuestion | null = session?.questions[session.currentIndex] ?? null;
  const isSessionComplete = session && session.currentIndex >= session.questions.length;
  
  // Session stats
  const sessionStats = useMemo(() => {
    if (!session) return { correct: 0, total: 0 };
    return {
      correct: session.answers.filter(a => a.correct).length,
      total: session.answers.length,
    };
  }, [session?.answers]);
  
  // Start a new quiz session
  const startNewSession = useCallback(() => {
    if (availableWords.length === 0) return;
    
    const newSession = generateQuizSession(
      availableWords,
      cardsPerSession,
      settings.learningFocus,
      quizSettings.questionSelection,
      quizSettings.optionSelection
    );
    setSession(newSession);
    setSelectedOption(null);
    setShowResult(false);
  }, [availableWords, cardsPerSession, settings.learningFocus, quizSettings.questionSelection, quizSettings.optionSelection]);
  
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
    setPendingAnswer({ index, correct });
  }, [showResult, currentQuestion, session]);
  
  // Commit the pending answer to store and Supabase
  const commitPendingAnswer = useCallback(() => {
    if (!pendingAnswer || !currentQuestion || !session) return;
    
    const { index, correct } = pendingAnswer;
    
    // Update session answers
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: [...prev.answers, {
          questionIndex: prev.currentIndex,
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
  
  // Go to next question (commits the pending answer first)
  const goToNext = useCallback(() => {
    if (!session) return;
    
    // Commit the pending answer before moving on
    commitPendingAnswer();
    
    setSession(prev => {
      if (!prev) return prev;
      const newIndex = prev.currentIndex + 1;
      
      // Check if session complete
      if (newIndex >= prev.questions.length) {
        // Record progress snapshot (add 1 to answers since commitPendingAnswer adds to it)
        const answersAfterCommit = pendingAnswer 
          ? [...prev.answers, { correct: pendingAnswer.correct }]
          : prev.answers;
        const correct = answersAfterCommit.filter(a => a.correct).length;
        store.recordProgressSnapshot(answersAfterCommit.length, correct);
        
        // Mark quiz completed for today
        markQuizCompletedToday();
        onStreakRefresh?.();
        
        // Fire confetti for session completion
        if (correct > answersAfterCommit.length * 0.6) {
          fireConfetti();
        }
        
        return {
          ...prev,
          currentIndex: newIndex,
          completedAt: new Date().toISOString(),
        };
      }
      
      return { ...prev, currentIndex: newIndex };
    });
    
    setSelectedOption(null);
    setShowResult(false);
  }, [session, store, commitPendingAnswer, pendingAnswer]);
  
  // Skip logging and go to next question
  const skipAndNext = useCallback(() => {
    if (!session) return;
    
    // Clear pending answer without committing (skip logging)
    setPendingAnswer(null);
    
    setSession(prev => {
      if (!prev) return prev;
      const newIndex = prev.currentIndex + 1;
      
      // Check if session complete
      if (newIndex >= prev.questions.length) {
        // Record progress snapshot (without this skipped question)
        const correct = prev.answers.filter(a => a.correct).length;
        store.recordProgressSnapshot(prev.answers.length, correct);
        
        // Mark quiz completed for today
        markQuizCompletedToday();
        onStreakRefresh?.();
        
        // Fire confetti for session completion
        if (correct > prev.answers.length * 0.6) {
          fireConfetti();
        }
        
        return {
          ...prev,
          currentIndex: newIndex,
          completedAt: new Date().toISOString(),
        };
      }
      
      return { ...prev, currentIndex: newIndex };
    });
    
    setSelectedOption(null);
    setShowResult(false);
  }, [session, store]);
  
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
  if (!session || !currentQuestion) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Main quiz view
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
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold">Quiz</h1>
            <p className="text-sm text-base-content/60">
              {session.currentIndex + 1} / {session.questions.length}
            </p>
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
          className="progress progress-primary w-full h-2" 
          value={session.currentIndex + 1} 
          max={session.questions.length}
        />
      </header>

      {/* Question Card */}
      <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col overflow-auto">
        <div className="card bg-base-200 shadow-xl border border-base-300">
          <div className="card-body gap-4">
            {/* Question */}
            <div className="text-center py-4">
              {modalityNeedsAudio(currentQuestion.questionModality) ? (
                // Audio question
                <div className="flex flex-col items-center gap-4">
                  <button
                    className={`btn btn-circle btn-lg ${isPlaying ? 'btn-error' : 'btn-primary'}`}
                    onClick={playQuestionAudio}
                    disabled={!ttsSupported}
                  >
                    {isPlaying ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Volume2 className="w-8 h-8" />
                    )}
                  </button>
                  <p className="text-base-content/60">Tap to hear the word</p>
                </div>
              ) : currentQuestion.questionModality === 'character' ? (
                // Character question - large display
                <div className="hanzi text-6xl font-bold text-primary">
                  {getModalityContent(currentQuestion.concept, 'character')}
                </div>
              ) : currentQuestion.questionModality === 'pinyin' ? (
                // Pinyin question
                <div className="pinyin text-4xl text-secondary">
                  {getModalityContent(currentQuestion.concept, 'pinyin')}
                </div>
              ) : (
                // Meaning question
                <div className="text-2xl font-medium">
                  {getModalityContent(currentQuestion.concept, 'meaning')}
                </div>
              )}
            </div>
            
            {/* Options - 2 cols for 4 options, 3 cols for 6 options */}
            <div className={`grid gap-3 mt-2 ${currentQuestion.options.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedOption === index;
                const isCorrect = index === currentQuestion.correctIndex;
                const showCorrectHighlight = showResult && isCorrect;
                const showWrongHighlight = showResult && isSelected && !isCorrect;
                const isAudioOption = currentQuestion.answerModality === 'audio';
                const isPreviewed = previewedAudioOption === index;
                const isPlayingThis = playingOptionIndex === index;
                
                // For audio options: click to play audio preview
                // For non-audio options: click to submit directly
                const handleClick = () => {
                  if (isAudioOption && !showResult) {
                    // Play audio preview (doesn't submit)
                    playOptionAudio(option, index);
                  } else {
                    // Non-audio options - submit directly
                    handleSelectOption(index);
                  }
                };
                
                return (
                  <button
                    key={option.id}
                    className={`
                      btn h-auto min-h-16 py-3 px-4 flex-col gap-1 text-wrap
                      ${!showResult && !isPreviewed ? 'btn-outline hover:btn-primary' : ''}
                      ${!showResult && isPreviewed ? 'btn-primary' : ''}
                      ${showCorrectHighlight ? 'btn-success' : ''}
                      ${showWrongHighlight ? 'btn-error' : ''}
                      ${showResult && !isSelected && !isCorrect ? 'btn-ghost opacity-70' : ''}
                    `}
                    onClick={handleClick}
                    disabled={showResult}
                  >
                    {/* Show icon for result */}
                    {showResult && isCorrect && (
                      <Check className="w-5 h-5 text-success-content" />
                    )}
                    {showWrongHighlight && (
                      <X className="w-5 h-5 text-error-content" />
                    )}
                    
                    {/* Option content */}
                    {currentQuestion.answerModality === 'character' ? (
                      <span className="hanzi text-2xl">
                        {getOptionDisplay(option, 'character')}
                      </span>
                    ) : currentQuestion.answerModality === 'pinyin' ? (
                      <span className="pinyin text-lg">
                        {getOptionDisplay(option, 'pinyin')}
                      </span>
                    ) : currentQuestion.answerModality === 'meaning' ? (
                      <span className="text-sm leading-tight">
                        {getOptionDisplay(option, 'meaning')}
                      </span>
                    ) : (
                      // Audio answer - show play button with loading state
                      <div className="flex flex-col items-center gap-1">
                        {isPlayingThis ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <Volume2 className="w-6 h-6" />
                        )}
                        {isPreviewed && !showResult && (
                          <span className="text-xs opacity-70">✓ Selected</span>
                        )}
                      </div>
                    )}
                    
                    {/* Show full details for all options after result */}
                    {showResult && (
                      <div className="flex flex-col items-center gap-0.5 mt-1 border-t border-current/10 pt-1 w-full">
                        {currentQuestion.answerModality !== 'character' && (
                          <span className="hanzi text-base">{option.word}</span>
                        )}
                        {currentQuestion.answerModality !== 'pinyin' && (
                          <span className="pinyin text-xs opacity-80">{option.pinyin}</span>
                        )}
                        {currentQuestion.answerModality !== 'meaning' && (
                          <span className="text-xs opacity-70 leading-tight text-center">{option.meaning}</span>
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
              // Get current paused state from store (reactive)
              const currentConcept = store.concepts.find(c => c.id === currentQuestion.concept.id);
              const isPaused = currentConcept?.paused ?? currentQuestion.concept.paused;
              
              return (
                <div className="mt-4 space-y-3">
                  {/* Show correct answer details */}
                  <div className={`alert ${selectedOption === currentQuestion.correctIndex ? 'alert-success' : 'alert-info'}`}>
                    <div className="flex flex-col gap-1">
                      <span className="font-bold">
                        {currentQuestion.concept.word} · {currentQuestion.concept.pinyin}
                      </span>
                      <span className="text-sm opacity-80">
                        {currentQuestion.concept.meaning}
                      </span>
                    </div>
                  </div>
                  
                  {/* Known/Unknown toggle, Don't log, and Next button */}
                  <div className="flex gap-2">
                    {/* Known toggle - checkbox style like vocab page */}
                    <button
                      className={`btn flex-shrink-0 gap-1.5 ${
                        isPaused 
                          ? 'btn-outline btn-warning' 
                          : 'btn-success'
                      }`}
                      onClick={() => store.togglePaused(currentQuestion.concept.id)}
                      title={isPaused ? 'Click to mark as known (include in quiz)' : 'Click to mark as unknown (exclude from quiz)'}
                    >
                      {isPaused ? (
                        <>
                          <Square className="w-4 h-4" />
                          <span className="hidden sm:inline">Unknown</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4" />
                          <span className="hidden sm:inline">Known</span>
                        </>
                      )}
                    </button>
                    
                    {/* Don't log button - skip recording this attempt */}
                    <button
                      className="btn btn-ghost btn-square text-base-content/50 hover:text-warning hover:bg-warning/10"
                      onClick={skipAndNext}
                      title="Don't log this attempt — we won't learn from this question (useful if you guessed)"
                    >
                      <Ban className="w-5 h-5" />
                    </button>
                    
                    {/* Next button */}
                    <button 
                      className="btn btn-primary flex-1"
                      onClick={goToNext}
                    >
                      {session.currentIndex + 1 >= session.questions.length ? 'See Results' : 'Next Question'}
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
