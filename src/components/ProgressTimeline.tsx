import { useMemo } from 'react';
import { Calendar, Target } from 'lucide-react';
import type { StreakData } from '../hooks/useStreak';

interface ProgressTimelineProps {
  streakData: StreakData;
  cardsPerSession: number;
  daysToShow?: number;
}

interface DayCell {
  date: string;
  label: string;
  attempts: number;
  correct: number;
  accuracy: number;
  recovered: boolean;  // gap day covered by extras
}

function quizzesForDay(attempts: number, cps: number): number {
  if (!cps || cps <= 0) return attempts > 0 ? 1 : 0;
  return Math.round(attempts / cps);
}

/**
 * Build display data: real activity + extras distributed to gap days.
 * Walks backward from today, same logic as useStreak, but marks recovered
 * gap days so they render as filled blocks.
 */
function buildDisplayDays(
  byDate: Record<string, { attempts: number; correct: number }>,
  cardsPerSession: number,
  daysToShow: number
): DayCell[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const anchor = new Date(todayStr + 'T12:00:00Z');

  const dates: string[] = [];
  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(anchor.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Walk backward to find which gap days are covered by extras (mirroring useStreak)
  const recoveredSet = new Set<string>();
  let extras = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const q = quizzesForDay(byDate[date]?.attempts ?? 0, cardsPerSession);
    const daysFromToday = dates.length - 1 - i;

    if (q >= 1) {
      extras += q - 1;
    } else if (date === todayStr) {
      // grace period
    } else if (extras > 0 && daysFromToday <= 7) {
      recoveredSet.add(date);
      extras--;
    } else {
      break;
    }
  }

  return dates.map((dateStr, i) => {
    const stats = byDate[dateStr] || { attempts: 0, correct: 0 };
    const isToday = i === dates.length - 1;
    const d = new Date(dateStr + 'T12:00:00Z');
    const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

    return {
      date: dateStr,
      label: isToday ? 'Today' : dow,
      attempts: stats.attempts,
      correct: stats.correct,
      accuracy: stats.attempts > 0
        ? Math.round((stats.correct / stats.attempts) * 100)
        : 0,
      recovered: recoveredSet.has(dateStr),
    };
  });
}

export function ProgressTimeline({ streakData, cardsPerSession, daysToShow = 14 }: ProgressTimelineProps) {
  const data = useMemo(
    () => buildDisplayDays(streakData.byDate, cardsPerSession, daysToShow),
    [streakData.byDate, cardsPerSession, daysToShow]
  );

  const summary = useMemo(() => {
    const totalAttempts = data.reduce((s, d) => s + d.attempts, 0);
    const totalCorrect = data.reduce((s, d) => s + d.correct, 0);
    const daysActive = data.filter(d => d.attempts > 0 || d.recovered).length;
    const avgAccuracy = totalAttempts > 0
      ? Math.round((totalCorrect / totalAttempts) * 100)
      : 0;
    return { totalAttempts, daysActive, avgAccuracy };
  }, [data]);

  if (streakData.loading) {
    return (
      <div className="bg-base-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <span className="loading loading-spinner loading-sm text-base-content/40" />
        </div>
      </div>
    );
  }

  if (summary.totalAttempts === 0) {
    return (
      <div className="bg-base-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="text-center py-6 text-base-content/50">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Complete some quizzes to see your activity!</p>
        </div>
      </div>
    );
  }

  const getBlockColor = (day: DayCell) => {
    if (day.attempts > 0) {
      if (day.accuracy >= 80) return 'bg-success';
      if (day.accuracy >= 60) return 'bg-warning';
      return 'bg-error';
    }
    if (day.recovered) return 'bg-success/40';
    return 'bg-base-300';
  };

  return (
    <div className="bg-base-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-base-content/60">
          <span>
            <span className="font-semibold text-primary">{summary.daysActive}</span> days active
          </span>
          <span className="text-base-content/30">&bull;</span>
          <span>
            <span className="font-semibold text-success">{summary.avgAccuracy}%</span> accuracy
          </span>
        </div>
      </div>

      {/* Block grid */}
      <div className="flex gap-1">
        {data.map((day, i) => {
          const isToday = i === data.length - 1;
          return (
            <div key={day.date} className="flex-1 group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                              opacity-0 group-hover:opacity-100 transition-opacity
                              pointer-events-none z-10">
                <div className="bg-base-100 shadow-lg rounded-lg px-2 py-1 text-xs
                                border border-base-300 whitespace-nowrap">
                  <div className="font-medium">{day.date}</div>
                  {day.attempts > 0 ? (
                    <>
                      <div>{day.attempts} questions</div>
                      <div className={day.accuracy >= 70 ? 'text-success' : 'text-warning'}>
                        {day.accuracy}% correct
                      </div>
                    </>
                  ) : day.recovered ? (
                    <div className="text-success/80">Covered by extra quiz</div>
                  ) : (
                    <div className="text-base-content/50">No activity</div>
                  )}
                </div>
              </div>

              {/* Block */}
              <div
                className={`aspect-[3/1] rounded-sm ${getBlockColor(day)}
                           ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-base-200' : ''}`}
              />
            </div>
          );
        })}
      </div>

      {/* Day labels */}
      <div className="flex gap-1">
        {data.map((day, i) => {
          const show = i === 0 || i === data.length - 1 || i % 4 === 0;
          return (
            <div key={day.date} className="flex-1 text-center">
              <span className={`text-[10px] ${show ? 'text-base-content/50' : 'text-transparent'}`}>
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-base-content/50 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-success" />
          <span>&ge;80%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-warning" />
          <span>60-79%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-error" />
          <span>&lt;60%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-success/40" />
          <span>Recovered</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-base-300" />
          <span>No activity</span>
        </div>
      </div>
    </div>
  );
}
