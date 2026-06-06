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
