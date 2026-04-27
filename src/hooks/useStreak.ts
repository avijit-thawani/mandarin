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
 * Format a Date as YYYY-MM-DD in the browser's local timezone.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build an array of YYYY-MM-DD strings from N days ago to today (inclusive),
 * in the browser's local timezone so streaks reset at local midnight.
 */
function buildDateArray(days: number): string[] {
  const now = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dates.push(toLocalDateString(d));
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

    if (q >= 1) {
      streak++;
      extras += q - 1;
    } else if (date === today) {
      // Grace period
    } else if (extras > 0) {
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

/**
 * Mirror computeCurrentStreak's backward walk. If the streak is unbroken
 * (all gaps covered by extras), returns empty missedDays. If the streak IS
 * broken (today has no activity and yesterday is a gap with no extras),
 * scans the recent window to find how many quizzes are needed to resume.
 */
function computeRecoveryInfo(
  byDate: Record<string, DayStats>,
  dates: string[],
  cardsPerSession: number
): { missedDays: string[]; availableExtras: number; quizzesNeeded: number } {
  const today = dates[dates.length - 1];

  // First pass: check if the streak is broken (same logic as computeCurrentStreak)
  let extras = 0;
  let streakBroken = false;
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const q = quizzesForDay(byDate[date]?.attempts ?? 0, cardsPerSession);

    if (q >= 1) {
      extras += q - 1;
    } else if (date === today) {
      // grace
    } else if (extras > 0) {
      extras--;
    } else {
      streakBroken = true;
      break;
    }
  }

  if (!streakBroken) {
    return { missedDays: [], availableExtras: extras, quizzesNeeded: 0 };
  }

  // Streak is broken — scan the 7-day window to find recoverable gap days
  const missed: string[] = [];
  extras = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const daysFromToday = dates.length - 1 - i;
    if (daysFromToday > MAX_RECOVERY_WINDOW) break;

    const date = dates[i];
    const q = quizzesForDay(byDate[date]?.attempts ?? 0, cardsPerSession);

    if (q >= 1) {
      extras += q - 1;
    } else if (date !== today) {
      missed.push(date);
    }
  }

  const quizzesNeeded = Math.max(0, missed.length - extras);
  return { missedDays: missed, availableExtras: extras, quizzesNeeded };
}

export function useStreak(
  userId: string | null | undefined,
  cardsPerSession: number = 10
) {
  const [byDate, setByDate] = useState<Record<string, DayStats>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) {
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
  }, [userId, refreshKey]);

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
