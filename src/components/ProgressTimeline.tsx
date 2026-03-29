// Progress Timeline - Historical chart of daily quiz activity and accuracy

import { useState, useEffect, useMemo } from 'react';
import { Calendar, TrendingUp, Target, Loader2, Flame, Snowflake } from 'lucide-react';
import { getQuizStats } from '../lib/quizService';

interface DayData {
  date: string;       // YYYY-MM-DD
  label: string;      // Display label (e.g., "Mon", "Jan 15")
  attempts: number;
  correct: number;
  accuracy: number;   // 0-100
  isFrozen: boolean;
}

interface ProgressTimelineProps {
  userId: string | null;
  isGuest?: boolean;
  daysToShow?: number;
  streak?: number;
  streakFreezes?: string[];
}

function getStoredStreakFreezes(): string[] {
  try {
    const raw = localStorage.getItem('langseed_streak_freezes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function ProgressTimeline({ userId, isGuest, daysToShow = 14, streak: externalStreak, streakFreezes }: ProgressTimelineProps) {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable freeze set: read from prop or localStorage once, keyed by JSON content
  const freezeSource = streakFreezes ?? getStoredStreakFreezes();
  const freezeKey = JSON.stringify(freezeSource);
  const freezeSet = useMemo(() => new Set(JSON.parse(freezeKey) as string[]), [freezeKey]);

  // Generate date range for the last N days (UTC-consistent)
  const dateRange = useMemo(() => {
    const dates: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const todayNoon = new Date(todayStr + 'T12:00:00Z');
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(todayNoon);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [daysToShow]);

  // Fetch quiz stats from Supabase (freezeSet excluded: it doesn't affect the query)
  useEffect(() => {
    async function fetchData() {
      if (!userId || isGuest) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysToShow);
      startDate.setHours(0, 0, 0, 0);

      const { byDate, error: fetchError } = await getQuizStats(userId, startDate);

      if (fetchError) {
        setError(fetchError);
        setLoading(false);
        return;
      }

      // Build data array for each day in range (isFrozen set below in a separate memo)
      const todayStr = new Date().toISOString().split('T')[0];
      const dayData: DayData[] = dateRange.map(dateStr => {
        const stats = byDate[dateStr] || { attempts: 0, correct: 0 };
        const date = new Date(dateStr + 'T12:00:00Z');
        const isToday = dateStr === todayStr;
        
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        
        return {
          date: dateStr,
          label: isToday ? 'Today' : dayOfWeek,
          attempts: stats.attempts,
          correct: stats.correct,
          accuracy: stats.attempts > 0 
            ? Math.round((stats.correct / stats.attempts) * 100) 
            : 0,
          isFrozen: false,
        };
      });

      setData(dayData);
      setLoading(false);
    }

    fetchData();
  }, [userId, isGuest, daysToShow, dateRange]);

  // Merge freeze status into data reactively without re-fetching
  const dataWithFreezes = useMemo(() => {
    if (freezeSet.size === 0) return data;
    return data.map(d => ({
      ...d,
      isFrozen: freezeSet.has(d.date),
    }));
  }, [data, freezeSet]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const totalAttempts = dataWithFreezes.reduce((sum, d) => sum + d.attempts, 0);
    const totalCorrect = dataWithFreezes.reduce((sum, d) => sum + d.correct, 0);
    const daysActive = dataWithFreezes.filter(d => d.attempts > 0 || d.isFrozen).length;
    const avgAccuracy = totalAttempts > 0 
      ? Math.round((totalCorrect / totalAttempts) * 100) 
      : 0;
    
    // Use external streak if provided, otherwise calculate locally
    let streak = externalStreak ?? 0;
    if (externalStreak === undefined) {
      for (let i = dataWithFreezes.length - 1; i >= 0; i--) {
        if (dataWithFreezes[i].attempts > 0 || dataWithFreezes[i].isFrozen) {
          streak++;
        } else if (i < dataWithFreezes.length - 1) {
          break;
        }
      }
    }
    
    return { totalAttempts, totalCorrect, daysActive, avgAccuracy, streak };
  }, [dataWithFreezes, externalStreak]);

  // Find max attempts for scaling bars
  const maxAttempts = useMemo(() => 
    Math.max(10, ...dataWithFreezes.map(d => d.attempts)), 
    [dataWithFreezes]
  );

  // Guest mode - show placeholder
  if (isGuest) {
    return (
      <div className="bg-base-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="text-center py-6 text-base-content/50">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sign in to track your progress over time</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-base-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-base-content/40" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-base-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="text-center py-4 text-error/70">
          <p className="text-sm">Failed to load activity data</p>
        </div>
      </div>
    );
  }

  // No data yet
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

  const hasFrozenDays = dataWithFreezes.some(d => d.isFrozen);

  return (
    <div className="bg-base-200 rounded-xl p-4 space-y-4">
      {/* Header with summary stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-base-content/60" />
          <h3 className="font-medium">Activity Timeline</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-base-content/60">
          <span title="Days with quiz activity">
            <span className="font-semibold text-primary">{summary.daysActive}</span> days active
          </span>
          <span className="text-base-content/30">•</span>
          <span title="Overall accuracy">
            <span className="font-semibold text-success">{summary.avgAccuracy}%</span> accuracy
          </span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="relative">
        {/* Bars container */}
        <div className="flex items-end gap-1 h-24">
          {dataWithFreezes.map((day, i) => {
            const barHeight = day.attempts > 0 
              ? Math.max(8, (day.attempts / maxAttempts) * 100) 
              : day.isFrozen ? 15 : 4;
            const isToday = i === dataWithFreezes.length - 1;
            
            const getBarColor = () => {
              if (day.isFrozen && day.attempts === 0) return 'bg-info/40';
              if (day.attempts === 0) return 'bg-base-300';
              if (day.accuracy >= 80) return 'bg-success';
              if (day.accuracy >= 60) return 'bg-warning';
              return 'bg-error';
            };
            
            return (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center justify-end group relative"
              >
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 
                               transition-opacity pointer-events-none z-10">
                  <div className="bg-base-100 shadow-lg rounded-lg px-2 py-1 text-xs 
                                border border-base-300 whitespace-nowrap">
                    <div className="font-medium">{day.date}</div>
                    {day.isFrozen && day.attempts === 0 ? (
                      <div className="text-info">Recovered</div>
                    ) : day.attempts > 0 ? (
                      <>
                        <div>{day.attempts} questions</div>
                        <div className={day.accuracy >= 70 ? 'text-success' : 'text-warning'}>
                          {day.accuracy}% correct
                        </div>
                        {day.isFrozen && <div className="text-info text-[10px]">+ Recovered</div>}
                      </>
                    ) : (
                      <div className="text-base-content/50">No activity</div>
                    )}
                  </div>
                </div>
                
                {/* Frozen indicator */}
                {day.isFrozen && day.attempts === 0 && (
                  <Snowflake className="w-2.5 h-2.5 text-info/70 mb-0.5" />
                )}
                
                {/* Bar */}
                <div
                  className={`w-full rounded-t transition-all duration-300 ${getBarColor()} 
                             ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-base-200' : ''}
                             ${day.isFrozen && day.attempts === 0 ? 'border border-dashed border-info/50' : ''}`}
                  style={{ height: `${barHeight}%`, minHeight: day.attempts > 0 ? '8px' : day.isFrozen ? '6px' : '4px' }}
                />
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="flex gap-1 mt-1">
          {dataWithFreezes.map((day, i) => {
            const showLabel = i === 0 || i === dataWithFreezes.length - 1 || i % 4 === 0;
            return (
              <div key={day.date} className="flex-1 text-center">
                <span className={`text-[10px] ${showLabel ? 'text-base-content/50' : 'text-transparent'}`}>
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-base-content/50 pt-1 flex-wrap">
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
          <div className="w-2 h-2 rounded-sm bg-base-300" />
          <span>No activity</span>
        </div>
        {hasFrozenDays && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-info/40 border border-dashed border-info/50" />
            <span>Recovered</span>
          </div>
        )}
      </div>

      {/* Streak indicator */}
      {summary.streak >= 1 && (
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-base-300">
          <Flame className="w-5 h-5 text-orange-500" />
          <span className="text-sm font-medium">
            {summary.streak} day streak!
          </span>
        </div>
      )}
    </div>
  );
}
