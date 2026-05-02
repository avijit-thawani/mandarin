import { useState, useCallback, useEffect } from 'react';
import { Volume2, Loader2, Check, X, Info, SkipForward } from 'lucide-react';
import type { SentenceExercise } from '../types/syntax';
import type { AudioSettings } from '../types/settings';
import { getTemplateById, shuffleArray } from '../utils/syntax';
import { speak, stopSpeaking, isTTSSupported, getVoiceForCurrentBrowser } from '../services/ttsService';

function getEnglishTiles(sentence: string): string[] {
  return sentence
    .replace(/[?.!,]/g, '')
    .split(' ')
    .filter(Boolean)
    .map(word => word.toLowerCase());
}

interface SyntaxExerciseCardProps {
  exercise: SentenceExercise;
  audioSettings?: AudioSettings;
  onComplete: (correct: boolean) => void;
  /** Optional skip handler. When provided, a Skip button appears pre-submit so users can pass on
   *  syntax exercises (which take longer to attempt than MCQ). Skipping does not record the attempt. */
  onSkip?: () => void;
  /** Label like "3/10" shown in parent header — card doesn't render its own header */
}

export function SyntaxExerciseCard({ exercise, audioSettings, onComplete, onSkip }: SyntaxExerciseCardProps) {
  const [userOrder, setUserOrder] = useState<string[]>([]);
  const [availableTiles, setAvailableTiles] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPlayingQuestion, setIsPlayingQuestion] = useState(false);
  const ttsSupported = isTTSSupported();

  // Initialize tiles when exercise changes
  useEffect(() => {
    if (exercise.direction === 'english_to_chinese') {
      const tiles = exercise.chineseModality === 'pinyin'
        ? exercise.pinyinWords
        : exercise.chineseWords;
      setAvailableTiles(shuffleArray([...tiles]));
    } else {
      const englishWords = getEnglishTiles(exercise.english);
      setAvailableTiles(shuffleArray([...englishWords]));
    }
    setUserOrder([]);
    setSubmitted(false);
    setIsCorrect(null);
    setShowExplanation(false);
  }, [exercise.id]);

  const handleTileTap = useCallback((tile: string, fromPool: boolean) => {
    if (submitted) return;
    if (fromPool) {
      setAvailableTiles(prev => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        const newTiles = [...prev];
        newTiles.splice(idx, 1);
        return newTiles;
      });
      setUserOrder(prev => [...prev, tile]);
    } else {
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

  const handleSubmit = useCallback(() => {
    if (submitted) return;
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

  const playAudio = useCallback(async () => {
    if (!ttsSupported) return;
    if (isPlayingQuestion) {
      stopSpeaking();
      setIsPlayingQuestion(false);
      return;
    }
    setIsPlayingQuestion(true);
    try {
      await speak(exercise.chineseWords.join(''), {
        voiceId: audioSettings ? getVoiceForCurrentBrowser(audioSettings) : undefined,
        rate: audioSettings?.speechRate ?? 0.9,
      });
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setIsPlayingQuestion(false);
    }
  }, [exercise, ttsSupported, isPlayingQuestion, audioSettings]);

  // Auto-play for audio modality
  useEffect(() => {
    if (exercise.chineseModality === 'audio' && exercise.direction === 'chinese_to_english' && ttsSupported && !submitted) {
      const timer = setTimeout(playAudio, 300);
      return () => clearTimeout(timer);
    }
  }, [exercise.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const template = getTemplateById(exercise.templateId);
  const isEnglishToChinese = exercise.direction === 'english_to_chinese';
  const correctAnswer = isEnglishToChinese
    ? (exercise.chineseModality === 'pinyin' ? exercise.pinyinWords : exercise.chineseWords)
    : getEnglishTiles(exercise.english);

  return (
    <div className="card bg-base-200 shadow-xl border border-base-300">
      <div className="card-body p-4 gap-2">
        {/* Direction badge */}
        <div className="text-center mb-1">
          <span className="badge badge-sm badge-ghost">
            {isEnglishToChinese ? '🇺🇸 → 🇨🇳' : '🇨🇳 → 🇺🇸'}
            {' '}
            {exercise.chineseModality === 'audio' ? '🔊' :
             exercise.chineseModality === 'pinyin' ? '🔤' : '📝'}
            {' · Syntax'}
          </span>
        </div>

        {/* Question prompt */}
        <div className="bg-base-300/50 rounded-lg p-3 mb-1">
          <p className="text-xs uppercase tracking-wider text-base-content/50 mb-1">
            {isEnglishToChinese ? 'Translate to Chinese' : 'Translate to English'}
          </p>
          {isEnglishToChinese ? (
            <p className="text-lg font-medium">{exercise.english}</p>
          ) : (
            <div className="flex items-center gap-3">
              {exercise.chineseModality === 'audio' ? (
                <button
                  onClick={playAudio}
                  className={`btn btn-circle btn-md ${isPlayingQuestion ? 'btn-error' : 'btn-primary'}`}
                  disabled={!ttsSupported}
                >
                  {isPlayingQuestion ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                </button>
              ) : exercise.chineseModality === 'pinyin' ? (
                <p className="text-xl text-secondary">{exercise.pinyinWords.join(' ')}</p>
              ) : (
                <p className="hanzi hanzi-scalable text-primary font-bold">{exercise.chineseWords.join('')}</p>
              )}
              {exercise.chineseModality !== 'audio' && ttsSupported && (
                <button
                  onClick={playAudio}
                  className={`btn btn-circle btn-sm ${isPlayingQuestion ? 'btn-error' : 'btn-ghost'}`}
                >
                  {isPlayingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* User's answer area */}
        <div className="mb-1">
          <p className="text-xs uppercase tracking-wider text-base-content/50 mb-1.5">
            Your answer (tap to arrange)
          </p>
          <div className={`
            min-h-[52px] p-2.5 rounded-xl border-2 border-dashed flex flex-wrap gap-1.5
            ${submitted
              ? (isCorrect ? 'border-success bg-success/10' : 'border-error bg-error/10')
              : 'border-base-content/20 bg-base-200'}
          `}>
            {userOrder.length === 0 ? (
              <span className="text-base-content/30 text-sm">Tap tiles below...</span>
            ) : (
              userOrder.map((tile, idx) => (
                <button
                  key={`user-${idx}`}
                  onClick={() => handleTileTap(tile, false)}
                  disabled={submitted}
                  className={`
                    btn btn-sm
                    ${isEnglishToChinese
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
        <div className="mb-1">
          <p className="text-xs uppercase tracking-wider text-base-content/50 mb-1.5">
            Available words
          </p>
          <div className="flex flex-wrap gap-1.5 min-h-[40px]">
            {availableTiles.map((tile, idx) => (
              <button
                key={`pool-${idx}`}
                onClick={() => handleTileTap(tile, true)}
                disabled={submitted}
                className={`
                  btn btn-sm btn-outline
                  ${isEnglishToChinese
                    ? (exercise.chineseModality === 'pinyin' ? 'font-normal' : 'hanzi text-lg')
                    : 'font-normal'}
                `}
              >
                {tile}
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        {submitted && (
          <div className={`
            rounded-lg p-3 mb-1
            ${isCorrect ? 'bg-success/20 border border-success/30' : 'bg-error/20 border border-error/30'}
          `}>
            <div className="flex items-center gap-2">
              {isCorrect ? (
                <><Check className="w-4 h-4 text-success" /><span className="font-bold text-sm text-success">Correct!</span></>
              ) : (
                <><X className="w-4 h-4 text-error" /><span className="font-bold text-sm text-error">Not quite</span></>
              )}
            </div>
            {!isCorrect && (
              <div className="mt-1.5">
                <p className="text-xs text-base-content/70">Correct answer:</p>
                <p className={`font-medium text-sm ${isEnglishToChinese ? 'hanzi text-base' : ''}`}>
                  {correctAnswer.join(isEnglishToChinese ? '' : ' ')}
                </p>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-base-content/10 space-y-0.5">
              <p className="hanzi text-base text-primary">{exercise.chineseWords.join('')}</p>
              <p className="text-xs text-secondary">{exercise.pinyinWords.join(' ')}</p>
              <p className="text-xs text-base-content/70">{exercise.english}</p>
            </div>
          </div>
        )}

        {/* Grammar explanation */}
        {showExplanation && template && (
          <div className="rounded-lg bg-info/10 border border-info/20 p-3 mb-1">
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-info mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-xs">{template.name}</p>
                <p className="text-xs text-base-content/70 mt-0.5">{template.explanation}</p>
                <div className="flex gap-3 mt-1 text-xs text-base-content/50">
                  <span>🇨🇳 {template.example.zh}</span>
                  <span>🇺🇸 {template.example.en}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {!submitted ? (
          <div className="flex gap-1.5 mt-1">
            {onSkip && (
              <button
                onClick={onSkip}
                className="btn btn-ghost btn-sm gap-1 text-base-content/60"
                title="Skip this question — it won't be recorded"
              >
                <SkipForward className="w-4 h-4" />
                <span className="hidden sm:inline">Skip</span>
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={userOrder.length === 0}
              className="btn btn-primary flex-1"
            >
              Check Answer
            </button>
          </div>
        ) : (
          <button
            onClick={() => onComplete(isCorrect ?? false)}
            className="btn btn-primary w-full mt-1"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
