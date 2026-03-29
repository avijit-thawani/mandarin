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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
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
 * Walk backward from today, counting consecutive days that have activity or are frozen.
 * Allows today to be empty (streak still holds if yesterday had activity).
 */
function calculateStreak(
  byDate: Record<string, DayStats>,
  freezes: string[]
): number {
  const freezeSet = new Set(freezes);
  const today = getDateStr(new Date());
  let streak = 0;
  let date = today;

  for (let i = 0; i < STREAK_DAYS_TO_FETCH; i++) {
    const hasActivity = (byDate[date]?.attempts ?? 0) > 0;
    const isFrozen = freezeSet.has(date);

    if (hasActivity || isFrozen) {
      streak++;
    } else if (date === today) {
      // Today can be empty without breaking streak
    } else {
      break;
    }

    date = addDays(date, -1);
  }

  return streak;
}

/**
 * Find the best historical streak across all data.
 */
function calculateBestStreak(
  byDate: Record<string, DayStats>,
  freezes: string[]
): number {
  const freezeSet = new Set(freezes);
  const allDates = Object.keys(byDate).sort();
  if (allDates.length === 0) return 0;

  const start = allDates[0];
  const end = getDateStr(new Date());
  let best = 0;
  let current = 0;
  let date = start;

  while (date <= end) {
    const hasActivity = (byDate[date]?.attempts ?? 0) > 0;
    const isFrozen = freezeSet.has(date);

    if (hasActivity || isFrozen) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }

    date = addDays(date, 1);
  }

  return best;
}

/**
 * Find missed days between the last active day (before the gap) and today.
 * These are the days that broke the streak and need recovery quizzes.
 * Capped at MAX_RECOVERY_DAYS to prevent absurd requirements after long breaks.
 */
function findMissedDays(
  byDate: Record<string, DayStats>,
  freezes: string[]
): string[] {
  const freezeSet = new Set(freezes);
  const today = getDateStr(new Date());
  const missed: string[] = [];

  // Walk backward from yesterday to find the gap
  let date = addDays(today, -1);
  let foundActivity = false;

  for (let i = 0; i < STREAK_DAYS_TO_FETCH; i++) {
    const hasActivity = (byDate[date]?.attempts ?? 0) > 0;
    const isFrozen = freezeSet.has(date);

    if (hasActivity || isFrozen) {
      if (!foundActivity) {
        foundActivity = true;
      }
      // Once we hit consecutive activity, stop
      if (missed.length > 0) break;
    } else {
      if (foundActivity || missed.length > 0) {
        // We've passed through the gap and hit activity — this shouldn't happen
        // due to the break above, but guard anyway
        break;
      }
      missed.unshift(date);
    }

    date = addDays(date, -1);
  }

  // Also check if today is a gap day between last activity and now
  // (today doesn't count as missed since user is here now)

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

  const streakData: StreakData = useMemo(() => {
    const today = getDateStr(new Date());
    const todayStats = byDate[today] || { attempts: 0, correct: 0 };
    const streak = calculateStreak(byDate, streakFreezes);
    const bestStreak = calculateBestStreak(byDate, streakFreezes);
    const missedDays = streak === 0 ? findMissedDays(byDate, streakFreezes) : [];
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
