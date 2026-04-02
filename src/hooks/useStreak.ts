import { useState, useEffect, useCallback, useMemo } from 'react';
import { getQuizStats } from '../lib/quizService';

const STREAK_FREEZES_KEY = 'langseed_streak_freezes';
const RECOVERY_QUIZZES_KEY = 'langseed_recovery_quizzes_today';
const STREAK_DAYS_TO_FETCH = 90;
const MAX_RECOVERY_DAYS = 7;

interface DayStats {
  attempts: number;
  correct: number;
}

export interface StreakData {
  streak: number;
  bestStreak: number;
  isStreakBroken: boolean;
  missedDays: string[];
  recoveryQuizzesNeeded: number;
  recoveryQuizzesCompleted: number;
  todayAttempts: number;
  todayCorrect: number;
  todayAccuracy: number;
  loading: boolean;
  byDate: Record<string, DayStats>;
  streakFreezes: string[];
}

function getDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Build an array of YYYY-MM-DD strings from N days ago to today (inclusive), in UTC.
 * Uses noon UTC as anchor to avoid any DST/timezone edge cases.
 */
function buildDateArray(days: number): string[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const anchor = new Date(todayStr + 'T12:00:00Z');
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchor.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getStreakFreezes(): string[] {
  try {
    const raw = localStorage.getItem(STREAK_FREEZES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStreakFreezes(freezes: string[]) {
  localStorage.setItem(STREAK_FREEZES_KEY, JSON.stringify(freezes));
}

function getRecoveryQuizzesToday(): number {
  try {
    const raw = localStorage.getItem(RECOVERY_QUIZZES_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (parsed.date === getDateStr(new Date())) {
      return parsed.count || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

function incrementRecoveryQuizzesToday(): number {
  const today = getDateStr(new Date());
  const current = getRecoveryQuizzesToday();
  const next = current + 1;
  localStorage.setItem(RECOVERY_QUIZZES_KEY, JSON.stringify({ date: today, count: next }));
  return next;
}

/**
 * Walk backward from today through a pre-built date array, counting consecutive
 * days with activity or frozen. Today can be empty without breaking the streak.
 */
function calculateStreak(
  byDate: Record<string, DayStats>,
  freezes: string[],
  dates: string[]
): number {
  const freezeSet = new Set(freezes);
  const today = dates[dates.length - 1];
  let streak = 0;

  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const hasActivity = (byDate[date]?.attempts ?? 0) > 0;
    const isFrozen = freezeSet.has(date);

    if (hasActivity || isFrozen) {
      streak++;
    } else if (date === today) {
      // Today can be empty without breaking streak
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Find the best historical streak across the date array.
 */
function calculateBestStreak(
  byDate: Record<string, DayStats>,
  freezes: string[],
  dates: string[]
): number {
  const freezeSet = new Set(freezes);
  let best = 0;
  let current = 0;

  for (const date of dates) {
    const hasActivity = (byDate[date]?.attempts ?? 0) > 0;
    const isFrozen = freezeSet.has(date);

    if (hasActivity || isFrozen) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

/**
 * Find missed days between the last active day (before the gap) and today.
 * Walk backward from yesterday; collect gap days until we hit activity.
 * Capped at MAX_RECOVERY_DAYS.
 */
function findMissedDays(
  byDate: Record<string, DayStats>,
  freezes: string[],
  dates: string[]
): string[] {
  const freezeSet = new Set(freezes);
  const missed: string[] = [];

  // Walk backward from yesterday (skip today = last element)
  for (let i = dates.length - 2; i >= 0; i--) {
    const date = dates[i];
    const hasActivity = (byDate[date]?.attempts ?? 0) > 0;
    const isFrozen = freezeSet.has(date);

    if (hasActivity || isFrozen) {
      // Hit activity — if we collected missed days, the gap is found
      break;
    } else {
      missed.unshift(date);
    }
  }

  return missed.slice(-MAX_RECOVERY_DAYS);
}

export function useStreak(userId: string | null | undefined, isGuest?: boolean) {
  const [byDate, setByDate] = useState<Record<string, DayStats>>({});
  const [loading, setLoading] = useState(true);
  const [streakFreezes, setStreakFreezes] = useState<string[]>(getStreakFreezes());
  const [recoveryCompleted, setRecoveryCompleted] = useState(getRecoveryQuizzesToday());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId || isGuest) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - STREAK_DAYS_TO_FETCH);
    startDate.setHours(0, 0, 0, 0);

    getQuizStats(userId, startDate).then(({ byDate: data }) => {
      setByDate(data);
      setLoading(false);
    });
  }, [userId, isGuest, refreshKey]);

  const dates = useMemo(() => buildDateArray(STREAK_DAYS_TO_FETCH), []);

  const streakData: StreakData = useMemo(() => {
    const today = dates[dates.length - 1];
    const todayStats = byDate[today] || { attempts: 0, correct: 0 };
    const streak = calculateStreak(byDate, streakFreezes, dates);
    const bestStreak = calculateBestStreak(byDate, streakFreezes, dates);
    const missedDays = streak === 0 ? findMissedDays(byDate, streakFreezes, dates) : [];
    const isStreakBroken = missedDays.length > 0;
    const recoveryQuizzesNeeded = missedDays.length;

    return {
      streak,
      bestStreak: Math.max(bestStreak, streak),
      isStreakBroken,
      missedDays,
      recoveryQuizzesNeeded,
      recoveryQuizzesCompleted: Math.min(recoveryCompleted, recoveryQuizzesNeeded),
      todayAttempts: todayStats.attempts,
      todayCorrect: todayStats.correct,
      todayAccuracy: todayStats.attempts > 0
        ? Math.round((todayStats.correct / todayStats.attempts) * 100)
        : 0,
      loading,
      byDate,
      streakFreezes,
    };
  }, [byDate, streakFreezes, recoveryCompleted, loading]);

  const completeRecoveryQuiz = useCallback(() => {
    const { missedDays } = streakData;
    if (missedDays.length === 0) return;

    // Freeze the earliest missed day
    const dayToFreeze = missedDays[0];
    const updated = [...streakFreezes, dayToFreeze];
    saveStreakFreezes(updated);
    setStreakFreezes(updated);

    const newCount = incrementRecoveryQuizzesToday();
    setRecoveryCompleted(newCount);
  }, [streakData, streakFreezes]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    setStreakFreezes(getStreakFreezes());
    setRecoveryCompleted(getRecoveryQuizzesToday());
  }, []);

  return {
    ...streakData,
    completeRecoveryQuiz,
    refresh,
  };
}
