import { X, Flame, Snowflake, TrendingUp, Target, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { StreakData } from '../hooks/useStreak';

interface StreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  streakData: StreakData;
  quizCompletedToday: boolean;
}

export function StreakModal({ isOpen, onClose, streakData, quizCompletedToday }: StreakModalProps) {
  const navigate = useNavigate();
  
  if (!isOpen) return null;

  const {
    streak,
    bestStreak,
    isStreakBroken,
    missedDays,
    recoveryQuizzesNeeded,
    recoveryQuizzesCompleted,
    todayAttempts,
    todayAccuracy,
    byDate,
    streakFreezes,
  } = streakData;

  const freezeSet = new Set(streakFreezes);
  const recoveryRemaining = recoveryQuizzesNeeded - recoveryQuizzesCompleted;

  // Build last 14 days for mini heatmap
  const heatmapDays: { date: string; attempts: number; accuracy: number; isFrozen: boolean; isToday: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const stats = byDate[dateStr] || { attempts: 0, correct: 0 };
    heatmapDays.push({
      date: dateStr,
      attempts: stats.attempts,
      accuracy: stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0,
      isFrozen: freezeSet.has(dateStr),
      isToday: i === 0,
    });
  }

  const handleResumeStreak = () => {
    onClose();
    navigate('/quiz?recovery=true');
  };

  const handleGoToQuiz = () => {
    onClose();
    navigate('/quiz');
  };

  const handleViewStats = () => {
    onClose();
    navigate('/profile');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-base-200 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto border border-base-300 animate-in fade-in slide-in-from-bottom duration-200">
        <button
          className="absolute top-3 right-3 btn btn-sm btn-circle btn-ghost z-10"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pt-8 space-y-5">
          {/* Hero streak display */}
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 ${
              isStreakBroken
                ? 'bg-base-300'
                : streak > 0
                  ? 'bg-gradient-to-br from-orange-500 to-amber-400'
                  : 'bg-base-300'
            }`}>
              {isStreakBroken ? (
                <Snowflake className="w-8 h-8 text-base-content/40" />
              ) : (
                <Flame className={`w-8 h-8 ${streak > 0 ? 'text-white' : 'text-base-content/40'}`} />
              )}
            </div>

            {isStreakBroken ? (
              <>
                <h2 className="text-2xl font-bold">Streak Broken</h2>
                <p className="text-base-content/60 text-sm mt-1">
                  You missed {missedDays.length} day{missedDays.length !== 1 ? 's' : ''}
                </p>
              </>
            ) : streak > 0 ? (
              <>
                <h2 className="text-2xl font-bold">
                  {streak} Day{streak !== 1 ? 's' : ''}!
                </h2>
                <p className="text-base-content/60 text-sm mt-1">
                  {quizCompletedToday ? 'Keep it going tomorrow!' : 'Complete a quiz to keep your streak!'}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold">Start a Streak</h2>
                <p className="text-base-content/60 text-sm mt-1">
                  Complete a daily quiz to begin
                </p>
              </>
            )}
          </div>

          {/* Best streak */}
          {bestStreak > 0 && (
            <div className="flex items-center justify-center gap-2 text-sm text-base-content/60">
              <TrendingUp className="w-4 h-4" />
              <span>Best streak: <strong className="text-base-content">{bestStreak} day{bestStreak !== 1 ? 's' : ''}</strong></span>
            </div>
          )}

          {/* Recovery progress */}
          {isStreakBroken && (
            <div className="bg-base-300 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-warning" />
                <span className="font-medium text-sm">Resume Your Streak</span>
              </div>

              {recoveryQuizzesCompleted > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-base-content/60">
                    <span>Recovery progress</span>
                    <span>{recoveryQuizzesCompleted}/{recoveryQuizzesNeeded} quizzes</span>
                  </div>
                  <div className="w-full bg-base-100 rounded-full h-2">
                    <div
                      className="bg-warning rounded-full h-2 transition-all duration-500"
                      style={{ width: `${(recoveryQuizzesCompleted / recoveryQuizzesNeeded) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-base-content/60">
                Complete {recoveryRemaining} quiz{recoveryRemaining !== 1 ? 'zes' : ''} to restore your streak.
                Each quiz covers one missed day.
              </p>

              <button
                onClick={handleResumeStreak}
                className="btn btn-warning btn-sm w-full"
              >
                <Flame className="w-4 h-4" />
                {recoveryQuizzesCompleted > 0 ? 'Continue Recovery' : 'Start Recovery Quiz'}
              </button>
            </div>
          )}

          {/* Today's stats */}
          {todayAttempts > 0 && (
            <div className="flex gap-3">
              <div className="flex-1 bg-base-300 rounded-lg p-3 text-center">
                <div className="text-lg font-bold">{todayAttempts}</div>
                <div className="text-xs text-base-content/60">Questions</div>
              </div>
              <div className="flex-1 bg-base-300 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-success">{todayAccuracy}%</div>
                <div className="text-xs text-base-content/60">Accuracy</div>
              </div>
            </div>
          )}

          {/* Mini heatmap */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-base-content/60">Last 14 days</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
              {heatmapDays.map(day => {
                const getCellColor = () => {
                  if (day.isFrozen) return 'bg-info/40 ring-1 ring-info/50';
                  if (day.attempts === 0) return 'bg-base-300';
                  if (day.accuracy >= 80) return 'bg-success';
                  if (day.accuracy >= 60) return 'bg-warning';
                  return 'bg-error';
                };

                return (
                  <div key={day.date} className="flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full aspect-square rounded-sm ${getCellColor()} ${
                        day.isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-base-200' : ''
                      }`}
                      title={`${day.date}: ${day.attempts} questions, ${day.accuracy}% accuracy${day.isFrozen ? ' (recovered)' : ''}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-3 text-[10px] text-base-content/50">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-success" />
                <span>80%+</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-warning" />
                <span>60%+</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-base-300" />
                <span>None</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-info/40 ring-1 ring-info/50" />
                <span>Recovered</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            {!isStreakBroken && !quizCompletedToday && (
              <button onClick={handleGoToQuiz} className="btn btn-primary btn-sm flex-1">
                <Target className="w-4 h-4" />
                Take Quiz
              </button>
            )}
            <button onClick={handleViewStats} className="btn btn-ghost btn-sm flex-1">
              View Full Stats
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
