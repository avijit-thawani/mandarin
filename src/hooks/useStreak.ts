import { useState, useEffect, useCallback, useMemo } from 'react';
import { getQuizStats } from '../lib/quizService';

const STREAK_DAYS_TO_FETCH = 90;
const MAX_RECOVERY_WINDOW = 7;

interface DayStats {
  attempts: number;
  correct: number;
}

export interface StreakData {
  streak: number;
  bestStreak: number;
  isStreakBroken: boolean;
  missedDays: string[];
  availableExtras: number;
  quizzesNeeded: number;
  todayAttempts: number;
  todayCorrect: number;
  todayAccuracy: number;
  loading: boolean;
  error: string | null;
  byDate: Record<string, DayStats>;
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

function quizzesForDay(attempts: number, cardsPerSession: number): number {
  if (!cardsPerSession || cardsPerSession <= 0) return attempts > 0 ? 1 : 0;
  return Math.round(attempts / cardsPerSession);
}

function computeCurrentStreak(
  byDate: Record<string, DayStats>,
  dates: string[],
  cardsPerSession: number
): { streak: number; extras: number } {
  const today = dates[dates.length - 1];
  let streak = 0;
  let extras = 0;

  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const q = quizzesForDay(byDate[date]?.attempts ?? 0, cardsPerSession);
    const daysFromToday = dates.length - 1 - i;

    if (q >= 1) {
      streak++;
      extras += q - 1;
    } else if (date === today) {
      // Grace period — haven't broken streak yet today
    } else if (extras > 0 && daysFromToday <= MAX_RECOVERY_WINDOW) {
      streak++;
      extras--;
    } else {
      break;
    }
  }

  return { streak, extras };
}

function computeBestStreak(
  byDate: Record<string, DayStats>,
  dates: string[],
  cardsPerSession: number
): number {
  let best = 0;
  let current = 0;
  let extras = 0;

  for (const date of dates) {
    const q = quizzesForDay(byDate[date]?.attempts ?? 0, cardsPerSession);

    if (q >= 1) {
      current++;
      extras += q - 1;
    } else if (extras > 0) {
      current++;
      extras--;
    } else {
      best = Math.max(best, current);
      current = 0;
      extras = 0;
    }
  }

  return Math.max(best, current);
}

function computeRecoveryInfo(
  byDate: Record<string, DayStats>,
  dates: string[],
  cardsPerSession: number
): { missedDays: string[]; availableExtras: number; quizzesNeeded: number } {
  const missed: string[] = [];
  let extras = 0;

  for (let i = dates.length - 1; i >= 0; i--) {
    const daysFromToday = dates.length - 1 - i;
    if (daysFromToday > MAX_RECOVERY_WINDOW) break;

    const date = dates[i];
    const q = quizzesForDay(byDate[date]?.attempts ?? 0, cardsPerSession);

    if (q >= 1) {
      extras += q - 1;
    } else if (daysFromToday > 0) {
      missed.push(date);
    }
  }

  const quizzesNeeded = Math.max(0, missed.length - extras);
  return { missedDays: missed, availableExtras: extras, quizzesNeeded };
}

export function useStreak(
  userId: string | null | undefined,
  isGuest?: boolean,
  cardsPerSession: number = 10
) {
  const [byDate, setByDate] = useState<Record<string, DayStats>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId || isGuest) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - STREAK_DAYS_TO_FETCH);
    startDate.setHours(0, 0, 0, 0);

    getQuizStats(userId, startDate)
      .then(({ byDate: data, error }) => {
        if (cancelled) return;
        if (error) setFetchError(error);
        setByDate(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId, isGuest, refreshKey]);

  const dates = useMemo(() => buildDateArray(STREAK_DAYS_TO_FETCH), []);

  const streakData: StreakData = useMemo(() => {
    const today = dates[dates.length - 1];
    const todayStats = byDate[today] || { attempts: 0, correct: 0 };

    const { streak, extras } = computeCurrentStreak(byDate, dates, cardsPerSession);
    const bestStreak = computeBestStreak(byDate, dates, cardsPerSession);
    const recovery = computeRecoveryInfo(byDate, dates, cardsPerSession);

    return {
      streak,
      bestStreak: Math.max(bestStreak, streak),
      isStreakBroken: recovery.quizzesNeeded > 0,
      missedDays: recovery.missedDays,
      availableExtras: extras,
      quizzesNeeded: recovery.quizzesNeeded,
      todayAttempts: todayStats.attempts,
      todayCorrect: todayStats.correct,
      todayAccuracy: todayStats.attempts > 0
        ? Math.round((todayStats.correct / todayStats.attempts) * 100)
        : 0,
      loading,
      error: fetchError,
      byDate,
    };
  }, [byDate, loading, cardsPerSession, fetchError]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return {
    ...streakData,
    refresh,
  };
}
