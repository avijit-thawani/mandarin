import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, BookOpen, HelpCircle, Loader2, Check, X, Shuffle, Info, Layers } from 'lucide-react';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { SettingsStore } from '../stores/settingsStore';
import type { SentenceExercise } from '../types/syntax';
import type { SyntaxDirectionRatio } from '../types/settings';
import {
  generateSentenceExercise,
  checkSyntaxUnlock,
  getTemplateById,
  shuffleArray,
} from '../utils/syntax';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';

interface SyntaxPageProps {
  store: VocabularyStore;
  settingsStore: SettingsStore;
  onShowHelp?: () => void;
}

function getEnglishTiles(sentence: string): string[] {
  return sentence
    .replace(/[?.!,]/g, '')
    .split(' ')
    .filter(Boolean)
    .map(word => word.toLowerCase());
}

export function SyntaxPage({ store, settingsStore, onShowHelp }: SyntaxPageProps) {
  const settings = settingsStore.settings;
  
  // Exercise state
  const [exercise, setExercise] = useState<SentenceExercise | null>(null);
  const [userOrder, setUserOrder] = useState<string[]>([]);
  const [availableTiles, setAvailableTiles] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  
  // Audio state
  const [isPlayingQuestion, setIsPlayingQuestion] = useState(false);
  const ttsSupported = isTTSSupported();
  
  // Get known vocabulary
  const knownVocab = useMemo(() => {
    return store.concepts.filter(c => !c.paused);
  }, [store.concepts]);
  
  // Check unlock status
  const unlockStatus = useMemo(() => {
    return checkSyntaxUnlock(knownVocab);
  }, [knownVocab]);
  
  // Get syntax settings with fallback
  const syntaxSettings = settings.syntax ?? { directionRatio: 1 as SyntaxDirectionRatio };
  
  // Generate a new exercise
  const generateNewExercise = useCallback(() => {
    const newExercise = generateSentenceExercise(
      knownVocab,
      settings.learningFocus,
      syntaxSettings.directionRatio
    );
    
    if (newExercise) {
      setExercise(newExercise);
      
      // For English→Chinese, shuffle Chinese tiles
      // For Chinese→English, shuffle English words
      if (newExercise.direction === 'english_to_chinese') {
        const tiles = newExercise.chineseModality === 'pinyin'
          ? newExercise.pinyinWords
          : newExercise.chineseWords;
        setAvailableTiles(shuffleArray([...tiles]));
      } else {
        // Chinese→English: shuffle English words
        const englishWords = getEnglishTiles(newExercise.english);
        setAvailableTiles(shuffleArray([...englishWords]));
      }
      
      setUserOrder([]);
      setSubmitted(false);
      setIsCorrect(null);
      setShowExplanation(false);
    }
  }, [knownVocab, settings.learningFocus, syntaxSettings.directionRatio]);
  
  // Generate exercise on mount or when vocab changes
  useEffect(() => {
    if (unlockStatus.unlocked && !exercise) {
      generateNewExercise();
    }
  }, [unlockStatus.unlocked, exercise, generateNewExercise]);
  
  // Handle tile tap - move to/from user order
  const handleTileTap = useCallback((tile: string, fromPool: boolean) => {
    if (submitted) return;
    
    if (fromPool) {
      // Move from available to user order
      setAvailableTiles(prev => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        const newTiles = [...prev];
        newTiles.splice(idx, 1);
        return newTiles;
      });
      setUserOrder(prev => [...prev, tile]);
    } else {
      // Move from user order back to available
      setUserOrder(prev => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        const newOrder = [...prev];
        newOrder.splice(idx, 1);
        return newOrder;
      });
      setAvailableTiles(prev => [...prev, tile]);
    }
  }, [submitted]);
  
  // Check answer
  const handleSubmit = useCallback(() => {
    if (!exercise || submitted) return;
    
    let correctOrder: string[];
    if (exercise.direction === 'english_to_chinese') {
      correctOrder = exercise.chineseModality === 'pinyin'
        ? exercise.pinyinWords
        : exercise.chineseWords;
    } else {
      correctOrder = getEnglishTiles(exercise.english);
    }
    
    const correct = JSON.stringify(userOrder) === JSON.stringify(correctOrder);
    setIsCorrect(correct);
    setSubmitted(true);
    setShowExplanation(true);
  }, [exercise, userOrder, submitted]);
  
  // Play audio for Chinese sentence
  const playAudio = useCallback(async () => {
    if (!exercise || !ttsSupported) return;
    
    if (isPlayingQuestion) {
      stopSpeaking();
      setIsPlayingQuestion(false);
      return;
    }
    
    setIsPlayingQuestion(true);
    try {
      await speak(exercise.chineseWords.join(''), {
        voiceId: settings?.audio ? getVoiceForCurrentBrowser(settings.audio) : undefined,
        rate: settings?.audio?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setIsPlayingQuestion(false);
    }
  }, [exercise, ttsSupported, isPlayingQuestion, settings?.audio]);
  
  // Auto-play audio for audio modality questions
  useEffect(() => {
    if (exercise?.chineseModality === 'audio' && exercise.direction === 'chinese_to_english' && ttsSupported && !submitted) {
      const timer = setTimeout(playAudio, 300);
      return () => clearTimeout(timer);
    }
  }, [exercise?.id]);
  
  // Get template for current exercise
  const template = exercise ? getTemplateById(exercise.templateId) : null;
  
  // ═══════════════════════════════════════════════════════════
  // RENDER: Not unlocked
  // ═══════════════════════════════════════════════════════════
  
  if (!unlockStatus.unlocked) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-base-100/95 backdrop-blur border-b border-base-300 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Syntax</h1>
            {onShowHelp && (
              <button
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={onShowHelp}
                title="Help & Guide"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-lg mx-auto">
            <div className="card bg-base-200">
              <div className="card-body items-center text-center py-10">
                <div className="text-6xl mb-4">🔒</div>
                <h2 className="text-2xl font-bold">Syntax Locked</h2>
                <p className="text-base-content/60 mt-2 max-w-xs">
                  Mark more words as known to unlock sentence construction!
                </p>
                
                <div className="mt-4 text-sm text-base-content/50">
                  <p>Need vocabulary for:</p>
                  <div className="flex flex-wrap gap-2 mt-2 justify-center">
                    {unlockStatus.missingRoles.slice(0, 5).map(role => {
                      const friendly: Record<string, string> = {
                        person: 'People (我/你/他)',
                        subject: 'Subjects',
                        edible: 'Food (苹果/米饭)',
                        drinkable: 'Drinks (茶/水)',
                        destination: 'Places (学校/家)',
                        readable: 'Books/Text',
                        watchable: 'TV/Movies',
                        furniture: 'Furniture (桌子/椅子)',
                        locatable: 'Objects',
                        describable: 'Describable things',
                        quality_adj: 'Quality words',
                        size_adj: 'Size words (大/小)',
                        appearance_adj: 'Appearance words',
                        emotion_adj: 'Feelings (高兴)',
                        temperature_adj: 'Temperature (冷/热)',
                        time: 'Time (今天/明天)',
                        vehicle: 'Transport (车/飞机)',
                        language: 'Languages (汉语)',
                        family: 'Family (爸爸/妈妈)',
                      };
                      return (
                        <span key={role} className="badge badge-outline">
                          {friendly[role] || role}
                        </span>
                      );
                    })}
                  </div>
                </div>
                
                <p className="text-xs text-base-content/40 mt-4">
                  {unlockStatus.availableTemplates}/{unlockStatus.totalTemplates} patterns available
                </p>
                
                <Link 
                  to="/vocab"
                  className="btn btn-primary mt-6 gap-2"
                >
                  <BookOpen className="w-5 h-5" />
                  Go to Vocabulary
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // ═══════════════════════════════════════════════════════════
  // RENDER: Loading / No exercise
  // ═══════════════════════════════════════════════════════════
  
  if (!exercise) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-base-content/60 mt-2">Generating exercise...</p>
      </div>
    );
  }
  
  // ═══════════════════════════════════════════════════════════
  // RENDER: Main exercise view
  // ═══════════════════════════════════════════════════════════
  
  const isEnglishToChinesedir = exercise.direction === 'english_to_chinese';
  
  // Determine correct answer for display
  const correctAnswer = isEnglishToChinesedir
    ? (exercise.chineseModality === 'pinyin' ? exercise.pinyinWords : exercise.chineseWords)
    : getEnglishTiles(exercise.english);
  
  return (
    <div className="h-full bg-gradient-to-b from-base-100 to-base-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Syntax</h1>
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
              onClick={generateNewExercise}
              title="New sentence"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col min-h-0 overflow-auto">
        {/* Direction indicator */}
        <div className="text-center mb-2">
          <span className="badge badge-sm badge-ghost">
            {isEnglishToChinesedir ? '🇺🇸 → 🇨🇳' : '🇨🇳 → 🇺🇸'}
            {' '}
            {exercise.chineseModality === 'audio' ? '🔊' : 
             exercise.chineseModality === 'pinyin' ? '🔤' : '📝'}
          </span>
        </div>
        
        {/* Question prompt */}
        <div className="card bg-base-200 border border-base-300 mb-4">
          <div className="card-body py-4">
            <p className="text-xs uppercase tracking-wider text-base-content/50 mb-1">
              {isEnglishToChinesedir ? 'Translate to Chinese' : 'Translate to English'}
            </p>
            
            {isEnglishToChinesedir ? (
              // Show English sentence
              <p className="text-xl font-medium">{exercise.english}</p>
            ) : (
              // Show Chinese (character, pinyin, or audio)
              <div className="flex items-center gap-3">
                {exercise.chineseModality === 'audio' ? (
                  <button
                    onClick={playAudio}
                    className={`btn btn-circle btn-lg ${isPlayingQuestion ? 'btn-error' : 'btn-primary'}`}
                    disabled={!ttsSupported}
                  >
                    {isPlayingQuestion ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Volume2 className="w-6 h-6" />
                    )}
                  </button>
                ) : exercise.chineseModality === 'pinyin' ? (
                  <p className="text-2xl text-secondary">{exercise.pinyinWords.join(' ')}</p>
                ) : (
                  <p className="hanzi hanzi-scalable text-primary font-bold">{exercise.chineseWords.join('')}</p>
                )}
                
                {/* Audio button for non-audio modalities */}
                {exercise.chineseModality !== 'audio' && ttsSupported && (
                  <button
                    onClick={playAudio}
                    className={`btn btn-circle btn-sm ${isPlayingQuestion ? 'btn-error' : 'btn-ghost'}`}
                  >
                    {isPlayingQuestion ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* User's answer construction area */}
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wider text-base-content/50 mb-2">
            Your answer (tap to arrange)
          </p>
          <div 
            className={`
              min-h-[60px] p-3 rounded-xl border-2 border-dashed flex flex-wrap gap-2
              ${submitted 
                ? (isCorrect ? 'border-success bg-success/10' : 'border-error bg-error/10')
                : 'border-base-content/20 bg-base-200'}
            `}
          >
            {userOrder.length === 0 ? (
              <span className="text-base-content/30 text-sm">Tap tiles below to build your answer...</span>
            ) : (
              userOrder.map((tile, idx) => (
                <button
                  key={`user-${idx}`}
                  onClick={() => handleTileTap(tile, false)}
                  disabled={submitted}
                  className={`
                    btn btn-sm
                    ${isEnglishToChinesedir 
                      ? (exercise.chineseModality === 'pinyin' ? 'font-normal' : 'hanzi text-lg')
                      : 'font-normal'}
                    ${submitted 
                      ? (correctAnswer[idx] === tile ? 'btn-success' : 'btn-error')
                      : 'btn-primary'}
                  `}
                >
                  {tile}
                </button>
              ))
            )}
          </div>
        </div>
        
        {/* Available tiles */}
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wider text-base-content/50 mb-2">
            Available words
          </p>
          <div className="flex flex-wrap gap-2 min-h-[44px]">
            {availableTiles.map((tile, idx) => (
              <button
                key={`pool-${idx}`}
                onClick={() => handleTileTap(tile, true)}
                disabled={submitted}
                className={`
                  btn btn-sm btn-outline
                  ${isEnglishToChinesedir 
                    ? (exercise.chineseModality === 'pinyin' ? 'font-normal' : 'hanzi text-lg')
                    : 'font-normal'}
                `}
              >
                {tile}
              </button>
            ))}
          </div>
        </div>
        
        {/* Result / Explanation */}
        {submitted && (
          <div className={`
            card mb-4 
            ${isCorrect ? 'bg-success/20 border border-success/30' : 'bg-error/20 border border-error/30'}
          `}>
            <div className="card-body py-3">
              <div className="flex items-center gap-2">
                {isCorrect ? (
                  <>
                    <Check className="w-5 h-5 text-success" />
                    <span className="font-bold text-success">Correct!</span>
                  </>
                ) : (
                  <>
                    <X className="w-5 h-5 text-error" />
                    <span className="font-bold text-error">Not quite</span>
                  </>
                )}
              </div>
              
              {!isCorrect && (
                <div className="mt-2">
                  <p className="text-sm text-base-content/70">Correct answer:</p>
                  <p className={`font-medium ${isEnglishToChinesedir ? 'hanzi text-lg' : ''}`}>
                    {correctAnswer.join(isEnglishToChinesedir ? '' : ' ')}
                  </p>
                </div>
              )}
              
              {/* Full sentence breakdown */}
              <div className="mt-3 pt-3 border-t border-base-content/10 space-y-1">
                <p className="hanzi text-lg text-primary">{exercise.chineseWords.join('')}</p>
                <p className="text-sm text-secondary">{exercise.pinyinWords.join(' ')}</p>
                <p className="text-sm text-base-content/70">{exercise.english}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Grammar explanation */}
        {showExplanation && template && (
          <div className="card bg-info/10 border border-info/20 mb-4">
            <div className="card-body py-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{template.name}</p>
                  <p className="text-xs text-base-content/70 mt-1">{template.explanation}</p>
                  <div className="flex gap-4 mt-2 text-xs text-base-content/50">
                    <span>🇨🇳 {template.example.zh}</span>
                    <span>🇺🇸 {template.example.en}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="flex gap-3 mt-auto pt-4">
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={userOrder.length === 0}
              className="btn btn-primary flex-1"
            >
              Check Answer
            </button>
          ) : (
            <button
              onClick={generateNewExercise}
              className="btn btn-primary flex-1"
            >
              Next Sentence
            </button>
          )}
        </div>
        
        {/* Template count indicator */}
        <p className="text-center text-xs text-base-content/40 mt-3">
          <Layers className="w-3 h-3 inline mr-1" />
          {unlockStatus.availableTemplates} patterns available
        </p>
      </div>
    </div>
  );
}
