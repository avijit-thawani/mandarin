// Per-day streak goal logic.
//
// The daily "goal" is one quiz session worth of cards. Streaks count a day if
// at least one goal was met; doing multiples of the goal banks extra days that
// can cover future gaps. The goal used to be read from the *current* setting and
// applied to every historical day, so lowering the setting retroactively inflated
// streaks. We now use the goal that actually applied on each day:
//   1. a stored goal (recorded going forward), if present, otherwise
//   2. an inferred goal using the "always pick the larger" rule below.
//
// "Always larger" picks the biggest candidate goal the day still satisfies. This
// resolves the ambiguity (a 50-card day divides by 10/20/50) toward the fewest
// banked extras, so a smaller setting can never inflate the streak, while genuine
// high-volume days (e.g. 150 cards at goal 50 = 3 quizzes) still bank real extras.

export const GOAL_CANDIDATES = [50, 30, 20] as const;

/**
 * Infer a day's goal from its attempt count: the largest candidate goal that the
 * day still completes at least once. Returns null when there's too little
 * activity to count as even one of the smallest goal (treated as a partial day).
 */
export function inferDailyGoal(attempts: number): number | null {
  if (attempts <= 0) return null;
  for (const goal of GOAL_CANDIDATES) {
    if (Math.round(attempts / goal) >= 1) return goal;
  }
  return null;
}

/**
 * Number of completed goal-sized quizzes for a day.
 * - 0 when there was no activity.
 * - 0.5 ("partial") when there was some activity but under one full goal.
 * - >=1 integer otherwise; the part above 1 banks as extras.
 *
 * Uses the stored goal when provided, otherwise the always-larger inference.
 */
export function quizzesForDay(attempts: number, storedGoal?: number | null): number {
  if (attempts <= 0) return 0;
  const goal = storedGoal && storedGoal > 0 ? storedGoal : inferDailyGoal(attempts);
  if (goal == null) return 0.5;
  const q = Math.round(attempts / goal);
  return q === 0 ? 0.5 : q;
}

// How many days a missed day can wait before its streak is permanently broken.
// Within this window the gap can still be "recovered" by banking extra quizzes.
export const RECOVERY_WINDOW = 20;

export interface StreakResult {
  streak: number;
  bestStreak: number;
  isStreakBroken: boolean;
  missedDays: string[];
  availableExtras: number;
  quizzesNeeded: number;
  /** Streak the user would have after doing quizzesNeeded extra quizzes to fill the recoverable gaps. */
  recoverableStreak: number;
  /** Gap days that count toward the streak because a banked extra covered them. */
  coveredDates: string[];
}

type DayKind = 'active' | 'partial' | 'frozen' | 'recovered' | 'broken' | 'pending' | 'today' | 'gap';

function counts(kind: DayKind): boolean {
  return kind === 'active' || kind === 'partial' || kind === 'frozen' || kind === 'recovered';
}

/**
 * Compute streak with carry-forward banking and recent-miss recovery.
 *
 * Banking is chronological: doing more than one goal on a day banks extra
 * "freezes" that carry forward and automatically cover later missed days. A miss
 * that occurs while the bank is empty breaks the streak, but if it happened
 * within RECOVERY_WINDOW days it stays "recoverable" — banking extra quizzes now
 * pays it off and reconnects the streak to the run before it.
 *
 * `dates` must be the ascending list of local YYYY-MM-DD strings ending today.
 */
export function computeStreak(
  byDate: Record<string, { attempts: number }>,
  dates: string[],
  goals: Record<string, number>
): StreakResult {
  const n = dates.length;
  if (n === 0) {
    return { streak: 0, bestStreak: 0, isStreakBroken: false, missedDays: [], availableExtras: 0, quizzesNeeded: 0, coveredDates: [] };
  }
  const todayIdx = n - 1;

  const qty: number[] = new Array(n);
  const kind: DayKind[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const q = quizzesForDay(byDate[dates[i]]?.attempts ?? 0, goals[dates[i]]);
    qty[i] = q;
    kind[i] = q >= 1 ? 'active' : q > 0 ? 'partial' : 'gap';
  }

  // Forward pass: classify each gap as frozen (covered by prior bank), recovered
  // (covered by a later extra within the window), or broken/pending.
  let bank = 0;
  const pending: number[] = [];
  for (let i = 0; i < n; i++) {
    if (kind[i] === 'active') {
      let extras = qty[i] - 1;
      // Recovery spends extras on the MOST RECENT pending gap first, protecting
      // the chain ending today. Spending on the oldest gap instead would starve
      // the recent streak and make the result non-monotonic in RECOVERY_WINDOW.
      while (extras > 0 && pending.length) {
        const g = pending[pending.length - 1];
        if (i - g > RECOVERY_WINDOW) break; // most recent pending is out of window
        pending.pop();
        kind[g] = 'recovered';
        extras--;
      }
      bank += extras;
    } else if (kind[i] === 'partial') {
      // counts as a day, banks nothing
    } else if (i === todayIdx) {
      kind[i] = 'today'; // grace: today not done yet, doesn't break the streak
    } else if (bank > 0) {
      bank--;
      kind[i] = 'frozen';
    } else {
      pending.push(i);
    }

    // Expire pending gaps that can no longer be recovered.
    while (pending.length && i - pending[0] > RECOVERY_WINDOW) {
      const g = pending.shift() as number;
      kind[g] = 'broken';
    }
  }
  for (const g of pending) kind[g] = 'pending';

  // Current streak: walk backward from today over counting days.
  let i = todayIdx;
  if (kind[i] === 'today') i--;
  let streak = 0;
  while (i >= 0 && counts(kind[i])) {
    streak++;
    i--;
  }

  // Recovery plan: continue backward through fillable (pending) gaps and the
  // counting days beyond them, until a permanently-broken day. This yields both
  // the streak that could be restored and the number of extra quizzes it takes.
  // A gap is only "recoverable" if there is real activity (an anchor) behind it
  // to reconnect to — otherwise a fully-lapsed user would be told to revive a
  // streak that no longer exists.
  const missed: string[] = [];
  let recoverableStreak = streak;
  let anchor = false;
  let k = i;
  while (k >= 0) {
    const kk = kind[k];
    if (kk === 'pending') {
      missed.push(dates[k]);
      recoverableStreak++;
      k--;
    } else if (counts(kk)) {
      anchor = true;
      recoverableStreak++;
      k--;
    } else {
      break; // broken / uncoverable gap ends the recoverable run
    }
  }
  const isBroken = missed.length > 0 && anchor;
  if (!isBroken) {
    missed.length = 0;
    recoverableStreak = streak;
  }

  // Best streak: longest consecutive run of counting days.
  let best = 0;
  let run = 0;
  for (let j = 0; j < n; j++) {
    if (counts(kind[j])) {
      run++;
      if (run > best) best = run;
    } else if (kind[j] !== 'today') {
      run = 0;
    }
  }

  const coveredDates: string[] = [];
  for (let j = 0; j < n; j++) {
    if (kind[j] === 'frozen' || kind[j] === 'recovered') coveredDates.push(dates[j]);
  }

  return {
    streak,
    bestStreak: Math.max(best, recoverableStreak),
    isStreakBroken: isBroken,
    missedDays: missed,
    availableExtras: bank,
    quizzesNeeded: missed.length,
    recoverableStreak,
    coveredDates,
  };
}
