import { useState, useEffect, useCallback, useMemo } from 'react';
import { getQuizStats, getDailyGoals, getDailySessions } from '../lib/quizService';
import { computeStreak } from '../lib/streakGoal';

// Must cover the user's full active streak; 90 days incorrectly capped long streaks.
const STREAK_DAYS_TO_FETCH = 365 * 5;

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
  recoverableStreak: number;
  todayAttempts: number;
  todayCorrect: number;
  todayAccuracy: number;
  loading: boolean;
  error: string | null;
  byDate: Record<string, DayStats>;
  goals: Record<string, number>;
  coveredDates: string[];
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

export function useStreak(userId: string | null | undefined) {
  const [byDate, setByDate] = useState<Record<string, DayStats>>({});
  const [goals, setGoals] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<Record<string, number>>({});
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

    Promise.all([
      getQuizStats(userId, startDate),
      getDailyGoals(userId, startDate),
      getDailySessions(userId, startDate),
    ])
      .then(([stats, goalRes, sessionRes]) => {
        if (cancelled) return;
        if (stats.error) setFetchError(stats.error);
        setByDate(stats.byDate);
        setGoals(goalRes.goals);
        setSessions(sessionRes.sessions);
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

    const result = computeStreak(byDate, dates, goals, sessions);

    return {
      streak: result.streak,
      bestStreak: result.bestStreak,
      isStreakBroken: result.isStreakBroken,
      missedDays: result.missedDays,
      availableExtras: result.availableExtras,
      quizzesNeeded: result.quizzesNeeded,
      recoverableStreak: result.recoverableStreak,
      coveredDates: result.coveredDates,
      todayAttempts: todayStats.attempts,
      todayCorrect: todayStats.correct,
      todayAccuracy: todayStats.attempts > 0
        ? Math.round((todayStats.correct / todayStats.attempts) * 100)
        : 0,
      loading,
      error: fetchError,
      byDate,
      goals,
    };
  }, [byDate, goals, sessions, dates, loading, fetchError]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return {
    ...streakData,
    refresh,
  };
}
