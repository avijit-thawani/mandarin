import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, BookOpen, HelpCircle, Loader2, Check, X, Zap, Square, CheckSquare, Settings2, Ban } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { TodayFilterStore } from '../stores/todayFilterStore';
import type { QuizSession, QuizQuestion, Modality, Concept } from '../types/vocabulary';
import type { SentenceExercise } from '../types/syntax';
import { generateQuizSession, getModalityContent, modalityNeedsAudio, selectionForDifficulty } from '../utils/quiz';
import { generateSentenceExercise, checkSyntaxUnlock } from '../utils/syntax';
import { predictCorrect, computeModalityAverages } from '../utils/knowledge';
import { saveQuizAttempt, buildQuizContext, recordDailyGoal, recordQuizSession } from '../lib/quizService';
import { clearNotifications } from '../lib/pwaReminderService';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';
import { haptic } from '../services/hapticService';
import { QuizMascot, mascotAppearsForSession } from '../components/mascot/QuizMascot';
import { useAuth } from '../hooks/useAuth';
import { OPTION_SELECTION_META, SYNTAX_FREQUENCY_META } from '../types/settings';
import type { OptionSelection, FocusLevel } from '../types/settings';
import { SyntaxExerciseCard } from '../components/SyntaxExerciseCard';
import { TriviaCard, type TriviaState } from '../components/TriviaCard';
import { buildCharacterIndex, type CharacterStatus } from '../lib/characterIndex';
import { fetchTrivia, rankTrivia, type TriviaSuggestion } from '../lib/triviaService';
import { pickThemedReview, type ThemeCandidate } from '../utils/reviewTheme';

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

// Mixed session item: MCQ, syntax exercise, or an LLM trivia interstitial.
// A trivia slot always sits directly after the MCQ whose word it is about — the card
// must relate to the question you just answered, never to an unrelated word.
type QuizItem =
  | { type: 'mcq'; questionIndex: number }
  | { type: 'syntax'; exercise: SentenceExercise }
  | { type: 'trivia'; id: string; questionIndex: number; focus: Concept };

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

/**
 * Put a candidate trivia slot directly after every MCQ, bound to that question's word.
 *
 * The card must be about the word you just answered, so slots are positioned rather
 * than scattered. Every slot gets a fact generated, but only the best few are shown
 * (see TRIVIA_SHOW_FRACTION) — the rest are skipped silently when reached, because
 * quality is only knowable after generation. A slot is never appended last, since
 * that would only delay the results screen.
 */
function insertTriviaSlots(items: QuizItem[], questions: QuizQuestion[]): QuizItem[] {
  const result: QuizItem[] = [];
  const usedFocusIds = new Set<string>();
  // Only the back half of the quiz carries slots: a call takes several seconds, so
  // early slots can be reached before they finish and show a spinner. Starting the
  // eligible range halfway in guarantees everything is generated on arrival, and
  // halves the number of calls per quiz.
  const firstEligibleIndex = Math.floor(items.length * TRIVIA_EARLIEST_FRACTION);

  items.forEach((item, idx) => {
    result.push(item);
    if (item.type !== 'mcq' || idx === items.length - 1) return;
    if (idx < firstEligibleIndex) return;

    const focus = questions[item.questionIndex]?.concept;
    // One slot per word: a repeat would only regenerate the same fact.
    if (!focus || usedFocusIds.has(focus.id)) return;

    usedFocusIds.add(focus.id);
    result.push({
      type: 'trivia',
      id: `trivia-q${item.questionIndex}`,
      questionIndex: item.questionIndex,
      focus,
    });
  });

  return result;
}

/** A fact generated for one slot, plus where that slot sits in the session. */
interface TriviaCandidate {
  slotId: string;
  itemIndex: number;
  focus: Concept;
  state: TriviaState;
}

/**
 * A card earns its interruption only if it has a next word to offer. Facts without a
 * suggestion read as trivia for its own sake, so they're skipped rather than shown.
 */
function isShowableTrivia(candidate: TriviaCandidate): boolean {
  return candidate.state.status === 'ready' && Boolean(candidate.state.fact.suggestion);
}

// Where in the session trivia slots become eligible. 0.5 means the back half only,
// which buys every card a head start of several questions.
const TRIVIA_EARLIEST_FRACTION = 0.5;

// Fraction of questions that actually yield a card. A fact is generated for every
// question, then the best of them are kept — tune this instead of exposing a knob,
// so what the user sees is curated rather than whatever landed at a fixed position.
const TRIVIA_SHOW_FRACTION = 0.1;

// Debug: show every generated card rather than only the top-ranked ones.
// Set to false to exercise the real "generate all, keep the best" behaviour.
const TRIVIA_DEBUG_SHOW_ALL = true;

// Gap between kicking off each background generation, so a 10-question quiz doesn't
// fire ten LLM calls simultaneously. All finish long before their slot is reached.
const TRIVIA_STAGGER_MS = 1200;

// The earliest slots are the ones a fast answerer can reach before generation finishes
// (a call takes several seconds), so they start immediately rather than staggered.
// Kept small: bursts of parallel calls draw provider rate limiting, which surfaces as
// failed cards.
const TRIVIA_IMMEDIATE_SLOTS = 2;

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
  const optionSelection = (rawQuiz?.optionSelection ?? rawQuiz?.difficulty ?? 'hard') as OptionSelection;
  const quizSettings = {
    // Question selection is now driven by difficulty (see selectionForDifficulty),
    // so harder difficulty automatically targets weak/stale words instead of random.
    questionSelection: selectionForDifficulty(optionSelection),
    optionSelection,
  };
  
  // Syntax settings
  const syntaxFrequency = (settings.syntax?.frequency ?? 1) as FocusLevel;
  const syntaxDirectionRatio = settings.syntax?.directionRatio ?? 1;

  // Trivia settings — interval of 0 disables the feature entirely
  // Trivia is on unless explicitly skipped. How many cards actually appear is decided
  // by TRIVIA_SHOW_FRACTION plus ranking, not by the setting's old interval scale.
  const triviaEnabled = (settings.trivia?.frequency ?? 2) > 0;

  // Quiz state
  const [session, setSession] = useState<QuizSession | null>(null);
  // Set when this session is a themed review; drives the banner and colour wash.
  const [reviewTheme, setReviewTheme] = useState<ThemeCandidate | null>(null);
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
  
  // Trivia: one fact generated per question in the background at session start, then
  // ranked so only the best few are actually shown. `triviaWinners` holds the slot ids
  // that get a card; every other slot is skipped silently when reached.
  const [triviaCandidates, setTriviaCandidates] = useState<TriviaCandidate[]>([]);
  const [triviaWinners, setTriviaWinners] = useState<Set<string>>(new Set());
  const triviaCoveredWords = useRef<string[]>([]);
  const triviaTimers = useRef<number[]>([]);
  const triviaRankStarted = useRef(false);
  // Ranking resolves asynchronously, so it needs the live position to only pick slots
  // the user hasn't already walked past.
  const mixedIndexRef = useRef(0);
  // Words added to vocab from a trivia card, so the button can show a done state
  const [addedBonusWords, setAddedBonusWords] = useState<Record<string, 'adding' | 'added' | 'error'>>({});
  
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

  // Mascot: seed is fixed per session, nonce bumps on each answer to trigger a
  // reaction. See mascotConfig.ts for every tunable.
  const [mascotSeed, setMascotSeed] = useState(() => `session-${Date.now()}`);
  const [answerNonce, setAnswerNonce] = useState(0);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false);
  const mascotVisible = useMemo(() => mascotAppearsForSession(mascotSeed), [mascotSeed]);
  // Handed to the mascot so her band can give space back to a tall card.
  const quizScrollAreaRef = useRef<HTMLDivElement>(null);
  
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
  
  // Generate the fact for one slot. Failures are surfaced in-card (with retry) rather
  // than thrown — a dead LLM call must never block the quiz.
  const loadCandidate = useCallback(async (slotId: string, focus: Concept) => {
    const setState = (state: TriviaState) => setTriviaCandidates(prev =>
      prev.map(c => c.slotId === slotId ? { ...c, state } : c)
    );

    setState({ status: 'loading' });
    try {
      const fact = await fetchTrivia(focus, availableWords, triviaCoveredWords.current);
      triviaCoveredWords.current = [...triviaCoveredWords.current, focus.word];
      if (!fact.suggestion) {
        // Worth watching: a card with no next word to offer is a weaker card.
        console.info(`[Trivia] no suggestion for ${focus.word}`);
      }
      setState({ status: 'ready', fact });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load trivia';
      console.error('Trivia error:', message);
      setState({ status: 'error', message });
    }
  }, [availableWords]);

  // Kick off background generation for every slot in the session, staggered.
  const startTriviaGeneration = useCallback((slots: Array<{ slotId: string; itemIndex: number; focus: Concept }>) => {
    triviaTimers.current.forEach(clearTimeout);
    triviaTimers.current = [];
    triviaRankStarted.current = false;
    setTriviaCandidates(slots.map(s => ({ ...s, state: { status: 'loading' } })));
    slots.forEach((slot, index) => {
      if (index < TRIVIA_IMMEDIATE_SLOTS) {
        loadCandidate(slot.slotId, slot.focus);
        return;
      }
      const delay = (index - TRIVIA_IMMEDIATE_SLOTS + 1) * TRIVIA_STAGGER_MS;
      triviaTimers.current.push(
        window.setTimeout(() => loadCandidate(slot.slotId, slot.focus), delay),
      );
    });
  }, [loadCandidate]);

  // Start a new quiz session (mixed MCQ + syntax)
  const startNewSession = useCallback(() => {
    if (availableWords.length === 0) return;
    
    // Determine syntax count based on frequency setting
    const syntaxFrac = SYNTAX_FREQUENCY_META[syntaxFrequency].fraction;
    const unlockStatus = checkSyntaxUnlock(availableWords);
    const canDoSyntax = syntaxFrequency > 0 && unlockStatus.unlocked;
    const syntaxCount = canDoSyntax ? Math.max(0, Math.round(cardsPerSession * syntaxFrac)) : 0;
    const mcqCount = cardsPerSession - syntaxCount;

    // Once in a while the session becomes a themed review. This narrows the MCQ words
    // only — distractors and syntax below keep using the full pool on purpose.
    const themed = pickThemedReview(availableWords, cardsPerSession);
    setReviewTheme(themed);
    if (themed) {
      console.info(`[ReviewTheme] "${themed.theme.id}" with ${themed.words.length} known words`);
    }

    // Generate MCQ questions
    const newSession = generateQuizSession(
      themed ? themed.words : availableWords,
      mcqCount,
      settings.learningFocus,
      quizSettings.questionSelection,
      quizSettings.optionSelection,
      availableWords
    );
    
    // Generate syntax exercises
    const syntaxExercises: SentenceExercise[] = [];
    if (syntaxCount > 0) {
      for (let i = 0; i < syntaxCount; i++) {
        const ex = generateSentenceExercise(availableWords, settings.learningFocus, syntaxDirectionRatio);
        if (ex) syntaxExercises.push(ex);
      }
    }
    
    // Build mixed session, then add a candidate trivia slot after each MCQ.
    // Not gated on auth.user: the session is built on mount, often before Supabase
    // auth resolves, which would silently disable trivia for the whole session.
    // Sign-in is mandatory app-wide, and fetchTrivia surfaces auth failures in-card.
    const items = triviaEnabled
      ? insertTriviaSlots(buildMixedSession(mcqCount, syntaxExercises), newSession.questions)
      : buildMixedSession(mcqCount, syntaxExercises);
    
    setSession(newSession);
    setMixedItems(items);
    setMixedIndex(0);
    setSyntaxAnswers([]);
    setSelectedOption(null);
    setShowResult(false);
    // New mascot identity per session: fixes her sari, veena and motion set for
    // the whole quiz, and decides (once) whether she shows up at all.
    setMascotSeed(`session-${Date.now()}`);
    setAnswerNonce(0);
    setTriviaWinners(new Set());
    setAddedBonusWords({});
    triviaCoveredWords.current = [];
    mixedIndexRef.current = 0;
    
    // Generate a fact for every slot up front, staggered, in the background.
    const slots = items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter((entry): entry is { item: Extract<QuizItem, { type: 'trivia' }>; itemIndex: number } =>
        entry.item.type === 'trivia')
      .map(({ item, itemIndex }) => ({ slotId: item.id, itemIndex, focus: item.focus }));

    console.info(
      `[Trivia] enabled=${triviaEnabled} slots=${slots.length} items=${items.length} ` +
      `showFraction=${TRIVIA_SHOW_FRACTION} debugShowAll=${TRIVIA_DEBUG_SHOW_ALL}`,
    );

    if (slots.length > 0) {
      startTriviaGeneration(slots);
    } else {
      triviaTimers.current.forEach(clearTimeout);
      triviaTimers.current = [];
      setTriviaCandidates([]);
    }
  }, [availableWords, cardsPerSession, settings.learningFocus, quizSettings.questionSelection, quizSettings.optionSelection, syntaxFrequency, syntaxDirectionRatio, triviaEnabled, startTriviaGeneration]);
  
  // Auto-start session on mount
  useEffect(() => {
    if (availableWords.length > 0 && !session) {
      startNewSession();
    }
  }, [availableWords.length, session, startNewSession]);
  
  // Question numbering excludes trivia cards so progress reflects real questions
  const totalQuestions = useMemo(
    () => mixedItems.filter(i => i.type !== 'trivia').length,
    [mixedItems],
  );
  const questionsSeen = useMemo(
    () => mixedItems.slice(0, mixedIndex).filter(i => i.type !== 'trivia').length,
    [mixedItems, mixedIndex],
  );
  const currentQuestionNumber = Math.min(questionsSeen + 1, Math.max(totalQuestions, 1));

  // Track live position for the async ranking pass below
  useEffect(() => { mixedIndexRef.current = mixedIndex; }, [mixedIndex]);

  /**
   * Once every fact has finished generating, ask the model which are worth showing and
   * keep that many. Only slots still ahead of the user are eligible, so a slow ranking
   * pass shifts the cards later in the session rather than losing them.
   */
  useEffect(() => {
    if (TRIVIA_DEBUG_SHOW_ALL || triviaRankStarted.current) return;
    if (triviaCandidates.length === 0) return;
    if (triviaCandidates.some(c => c.state.status === 'loading')) return;

    const ready = triviaCandidates.filter(isShowableTrivia);
    if (ready.length === 0) return;

    triviaRankStarted.current = true;
    const quota = Math.max(1, Math.round(totalQuestions * TRIVIA_SHOW_FRACTION));
    const eligible = ready.filter(c => c.itemIndex > mixedIndexRef.current);
    if (eligible.length === 0) return;

    (async () => {
      const payload = eligible.map(c => ({
        word: c.focus.word,
        title: c.state.status === 'ready' ? c.state.fact.title : '',
        body: c.state.status === 'ready' ? c.state.fact.body : '',
      }));

      let winners: string[];
      try {
        const top = await rankTrivia(payload, quota);
        winners = top.map(i => eligible[i]?.slotId).filter((id): id is string => Boolean(id));
        // A ranking that returns nothing usable shouldn't silently suppress all cards.
        if (winners.length === 0) winners = eligible.slice(0, quota).map(c => c.slotId);
      } catch (err) {
        console.error('Trivia ranking failed, falling back to first ready:', err);
        winners = eligible.slice(0, quota).map(c => c.slotId);
      }
      console.info(`[Trivia] quota=${quota} candidates=${eligible.length} winners=${winners.join(',')}`);
      setTriviaWinners(new Set(winners));
    })();
  }, [triviaCandidates, totalQuestions]);

  // Skip a slot the user shouldn't see: one that failed, produced no suggestion, or
  // wasn't picked by the ranking pass.
  useEffect(() => {
    if (currentItem?.type !== 'trivia') return;
    const candidate = triviaCandidates.find(c => c.slotId === currentItem.id);

    // Still generating — hold position; the card will render when it resolves.
    if (candidate?.state.status === 'loading') return;

    const showable = candidate ? isShowableTrivia(candidate) : false;
    if (showable && (TRIVIA_DEBUG_SHOW_ALL || triviaWinners.has(currentItem.id))) return;

    setMixedIndex(i => i + 1);
  }, [currentItem, triviaWinners, triviaCandidates]);

  // Drop pending generation timers if the user leaves the Quiz tab mid-session
  useEffect(() => () => { triviaTimers.current.forEach(clearTimeout); }, []);

  // Add a word suggested by a trivia card to the user's vocabulary in one tap
  const handleAddSuggestedWord = useCallback(async (suggestion: TriviaSuggestion) => {
    if (store.getConceptByWord(suggestion.word)) {
      setAddedBonusWords(prev => ({ ...prev, [suggestion.word]: 'added' }));
      return;
    }
    setAddedBonusWords(prev => ({ ...prev, [suggestion.word]: 'adding' }));
    try {
      await store.addCustomWord(
        suggestion.word,
        suggestion.pinyin,
        suggestion.meaning,
        suggestion.partOfSpeech,
        suggestion.category,
      );
      haptic('correct');
      setAddedBonusWords(prev => ({ ...prev, [suggestion.word]: 'added' }));
    } catch (err) {
      console.error('Add suggested word error:', err);
      setAddedBonusWords(prev => ({ ...prev, [suggestion.word]: 'error' }));
    }
  }, [store]);

  const isKnownWord = useCallback(
    (word: string) => Boolean(store.getConceptByWord(word)),
    [store],
  );

  const characterIndex = useMemo(() => buildCharacterIndex(store.concepts), [store.concepts]);

  const lookupCharacter = useCallback(
    (char: string): CharacterStatus => characterIndex.get(char) ?? { kind: 'new' },
    [characterIndex],
  );

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
    haptic('select');
    
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
    haptic(correct ? 'correct' : 'wrong');
    
    // Store pending answer - will be logged when user clicks Next (or skipped if they click "Don't log")
    setPendingAnswer({ index, correct, mcqIndex: currentMcqIndex });
    setLastAnswerCorrect(correct);
    setAnswerNonce(n => n + 1);
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
    if (auth.user) {
      recordDailyGoal(auth.user.id, cardsPerSession);
      recordQuizSession(auth.user.id, cardsPerSession);
    }
    onStreakRefresh?.();
    haptic('complete');
    if (totalCorrect > totalCount * 0.6) {
      fireConfetti();
    }
  }, [store, onStreakRefresh, auth.user, cardsPerSession]);

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
    setLastAnswerCorrect(correct);
    setAnswerNonce(n => n + 1);
    
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

  // Dismiss a trivia card — purely informational, so nothing is scored or logged.
  // Trivia is never the last item, but guard for session completion defensively.
  const handleTriviaContinue = useCallback(() => {
    const nextMixed = mixedIndex + 1;
    if (nextMixed >= mixedItems.length && session) {
      handleSessionComplete(session.answers, syntaxAnswers);
      setSession(prev => prev ? { ...prev, completedAt: new Date().toISOString() } : prev);
    }
    setMixedIndex(nextMixed);
  }, [mixedIndex, mixedItems, session, syntaxAnswers, handleSessionComplete]);

  // Get display content for an option
  const getOptionDisplay = (option: Concept, modality: Modality): string => {
    return getModalityContent(option, modality);
  };

  // Themed-review chrome. The tint travels as a CSS custom property so index.css can
  // mix it over the current base colours; every session shell below shares these so a
  // themed session looks the same whichever item type is on screen.
  const shellClass = reviewTheme
    ? 'h-full quiz-themed flex flex-col overflow-hidden'
    : 'h-full bg-gradient-to-b from-base-100 to-base-200 flex flex-col overflow-hidden';
  const shellStyle = reviewTheme
    ? ({ '--review-tint': reviewTheme.theme.tint } as React.CSSProperties)
    : undefined;

  const themeBanner = reviewTheme ? (
    <div className="flex-shrink-0 review-banner border-b px-4 py-1.5 animate-slide-up">
      <div className="flex items-center justify-center gap-2 text-sm">
        <span aria-hidden="true">{reviewTheme.theme.emoji}</span>
        <span className="font-bold review-banner-text">{reviewTheme.theme.name}</span>
        <span className="text-base-content/50">themed review</span>
      </div>
    </div>
  ) : null;
  
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
                      className="btn btn-primary btn-lg btn-chunky mt-6 gap-2"
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
                      className="btn btn-primary btn-lg btn-chunky mt-6 gap-2"
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
      <div
        className={`h-full flex flex-col overflow-hidden${reviewTheme ? ' quiz-themed' : ''}`}
        style={shellStyle}
      >
        {themeBanner}
        <header className="flex-shrink-0 bg-base-100/95 backdrop-blur border-b border-base-300 px-4 py-3">
          <h1 className="text-xl font-bold text-center">Quiz Complete!</h1>
        </header>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-lg mx-auto">
            <div className="card bg-base-200 animate-pop-in">
              <div className="card-body items-center text-center py-10">
                <div className="text-7xl mb-4 animate-pop-in">
                  {accuracy >= 80 ? '🎉' : accuracy >= 60 ? '👍' : '💪'}
                </div>
                <h2 className="text-3xl font-bold">
                  {accuracy >= 80 ? 'Excellent!' : accuracy >= 60 ? 'Good Job!' : 'Keep Practicing!'}
                </h2>

                {reviewTheme && (
                  <p className="text-sm text-base-content/70 mt-2 max-w-xs">
                    <span className="font-semibold review-banner-text">
                      {reviewTheme.theme.emoji} {reviewTheme.theme.name}
                    </span>
                    {' — '}{reviewTheme.theme.blurb.toLowerCase()}
                  </p>
                )}
                
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
                  className="btn btn-primary btn-lg btn-chunky mt-8 gap-2 w-full max-w-xs"
                  onClick={() => { haptic('tap'); startNewSession(); }}
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
  
  // Trivia interstitial — no scoring, just a beat between questions
  if (currentItem.type === 'trivia') {
    const triviaItem = currentItem;
    const candidate = triviaCandidates.find(c => c.slotId === triviaItem.id);
    return (
      <div className={shellClass} style={shellStyle}>
        {themeBanner}
        <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quiz</h1>
              <span className="text-sm text-base-content/60">
                {questionsSeen}/{totalQuestions}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>{sessionStats.correct}</span>
            </div>
          </div>
          <progress
            className="progress progress-primary progress-animated w-full h-2.5"
            value={questionsSeen}
            max={totalQuestions}
          />
        </header>

        <div className="flex-1 px-3 py-2 max-w-lg mx-auto w-full flex flex-col justify-center overflow-auto">
          {candidate ? (
            <TriviaCard
              focus={candidate.focus}
              focusLabel="You just answered"
              state={candidate.state}
              audioSettings={settings.audio}
              addedWords={addedBonusWords}
              isKnownWord={isKnownWord}
              lookupCharacter={lookupCharacter}
              onAddWord={handleAddSuggestedWord}
              onContinue={handleTriviaContinue}
              onRetry={() => loadCandidate(candidate.slotId, candidate.focus)}
            />
          ) : (
            <div className="card bg-base-200 shadow-xl border border-warning/40">
              <div className="card-body items-center gap-4 py-10">
                <Loader2 className="w-6 h-6 animate-spin text-warning" />
                <button className="btn btn-primary w-full" onClick={handleTriviaContinue}>
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Syntax exercise item
  if (currentItem.type === 'syntax') {
    return (
      <div className={shellClass} style={shellStyle}>
        {themeBanner}
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
                {currentQuestionNumber}/{totalQuestions}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Check className="w-4 h-4 text-success" />
              <span>{sessionStats.correct}</span>
            </div>
          </div>
          <progress 
            className="progress progress-primary progress-animated w-full h-2.5" 
            value={currentQuestionNumber} 
            max={totalQuestions}
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
    <div className={shellClass} style={shellStyle}>
      {themeBanner}
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
              {currentQuestionNumber}/{totalQuestions}
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
                  
                  {/* Difficulty (drives distractor trickiness + word selection) */}
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
          className="progress progress-primary progress-animated w-full h-2.5" 
          value={currentQuestionNumber} 
          max={totalQuestions}
        />
      </header>

      {/* Question Card */}
      {/* Top-anchored, never centered: centering makes the card grow upward when
          the answer feedback appears, yanking the question and options out from
          under the user's finger. */}
      <div ref={quizScrollAreaRef} className="flex-1 px-3 py-3 max-w-lg mx-auto w-full flex flex-col overflow-auto">

        <div
          key={currentQuestion.concept.id}
          className="card bg-base-200 shadow-xl border border-base-300 animate-pop-in"
        >
          <div className="card-body p-4 gap-3">
            {/* Question */}
            <div className="text-center py-3">
              {modalityNeedsAudio(currentQuestion.questionModality) ? (
                // Audio question
                <div className="flex flex-col items-center gap-3">
                  <button
                    className={`btn btn-circle btn-lg btn-chunky ${isPlaying ? 'btn-error' : 'btn-primary'}`}
                    onClick={playQuestionAudio}
                    disabled={!ttsSupported}
                  >
                    {isPlaying ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Volume2 className="w-8 h-8" />
                    )}
                  </button>
                  <p className="text-sm text-base-content/60">Tap to hear the word</p>
                </div>
              ) : currentQuestion.questionModality === 'character' ? (
                // Character question
                <div className="hanzi text-6xl font-bold text-primary">
                  {getModalityContent(currentQuestion.concept, 'character')}
                </div>
              ) : currentQuestion.questionModality === 'pinyin' ? (
                // Pinyin question with optional audio
                <div className="flex flex-col items-center gap-1.5">
                  <div className="pinyin text-4xl text-secondary">
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
                <div className="text-2xl font-medium">
                  {getModalityContent(currentQuestion.concept, 'meaning')}
                </div>
              )}
            </div>
            
            {/* Options - 2 cols for 4 options, 3 cols for 6 options */}
            <div className={`grid gap-3 ${currentQuestion.options.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                      btn answer-option btn-chunky
                      ${showResult ? 'pointer-events-none' : ''}
                      ${!showResult && !isPreviewed ? 'answer-option-idle' : ''}
                      ${!showResult && isPreviewed ? 'btn-primary' : ''}
                      ${showCorrectHighlight ? 'btn-success animate-pulse-correct' : ''}
                      ${showWrongHighlight ? 'btn-error animate-shake' : ''}
                      ${showResult && !isSelected && !isCorrect ? 'btn-ghost opacity-50' : ''}
                    `}
                    onClick={handleClick}
                    /* Not `disabled` — daisyUI's disabled style greys out the fill,
                       hiding the green/red answer feedback. handleSelectOption
                       already ignores clicks once showResult is set. */
                    aria-disabled={showResult}
                  >
                    {/* Absolutely positioned so appearing on answer costs no layout
                        height — inline, it grew every option and pushed the second
                        row down. Sits in the button's top padding. */}
                    {showResult && isCorrect && (
                      <Check className="w-5 h-5 text-success-content absolute top-1 left-1/2 -translate-x-1/2" />
                    )}
                    {showWrongHighlight && (
                      <X className="w-5 h-5 text-error-content absolute top-1 left-1/2 -translate-x-1/2" />
                    )}
                    
                    {currentQuestion.answerModality === 'character' ? (
                      <span className="hanzi text-3xl">
                        {getOptionDisplay(option, 'character')}
                      </span>
                    ) : currentQuestion.answerModality === 'pinyin' ? (
                      <span className="pinyin text-xl">
                        {getOptionDisplay(option, 'pinyin')}
                      </span>
                    ) : currentQuestion.answerModality === 'meaning' ? (
                      <span className="text-base leading-snug">
                        {getOptionDisplay(option, 'meaning')}
                      </span>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        {isPlayingThis ? (
                          <Loader2 className="w-7 h-7 animate-spin" />
                        ) : (
                          <Volume2 className="w-7 h-7" />
                        )}
                        {isPreviewed && !showResult && (
                          <span className="text-xs opacity-70">✓ Selected</span>
                        )}
                      </div>
                    )}
                    
                    {/* Always rendered so the option keeps a constant height —
                        revealing this on answer would otherwise grow every button
                        and shove the second row of options down. `invisible` keeps
                        the reserved space while hiding it from view and from the
                        accessibility tree. It leaks no answer: each option shows
                        only its own word, not which one is correct. */}
                    <div
                      aria-hidden={!showResult}
                      className={`flex flex-col items-center gap-0 mt-0.5 border-t border-current/10 pt-0.5 w-full ${showResult ? '' : 'invisible'}`}
                    >
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
                  </button>
                );
              })}
            </div>
            
            {/* Submit button for audio options */}
            {currentQuestion.answerModality === 'audio' && previewedAudioOption !== null && !showResult && (
              <button 
                className="btn btn-primary btn-lg btn-chunky w-full mt-3"
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
                <div className="mt-2 space-y-3 animate-slide-up">
                  <div className={`alert py-3 ${selectedOption === currentQuestion.correctIndex ? 'alert-success' : 'alert-info'}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-base">
                        {currentQuestion.concept.word} · {currentQuestion.concept.pinyin}
                      </span>
                      <span className="text-sm opacity-80">
                        {currentQuestion.concept.meaning}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      className={`btn btn-chunky flex-shrink-0 gap-1 ${
                        isPaused 
                          ? 'btn-outline btn-warning' 
                          : 'btn-success'
                      }`}
                      onClick={() => { haptic('tap'); store.togglePaused(currentQuestion.concept.id); }}
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
                    
                    <button
                      className="btn btn-square btn-ghost text-base-content/50 hover:text-warning hover:bg-warning/10"
                      onClick={() => { haptic('tap'); skipAndNext(); }}
                      title="Don't log this attempt — we won't learn from this question (useful if you guessed)"
                    >
                      <Ban className="w-5 h-5" />
                    </button>
                    
                    <button 
                      className="btn btn-primary btn-chunky flex-1 text-base"
                      onClick={() => { haptic('tap'); goToNext(); }}
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

      {/* Saras sits below the quiz, OUTSIDE the scrolling area above. Her band is
          reserved for the whole session, so revealing an answer scrolls the card
          within its own container and never moves her. */}
      {mascotVisible && (
        <QuizMascot
          sessionSeed={mascotSeed}
          answerNonce={answerNonce}
          lastCorrect={lastAnswerCorrect}
          accuracy={sessionStats.total > 0 ? sessionStats.correct / sessionStats.total : 0}
          answered={sessionStats.total}
          showingResult={showResult}
          scrollAreaRef={quizScrollAreaRef}
        />
      )}
    </div>
  );
}
