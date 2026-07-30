import { Link, useLocation } from 'react-router-dom';
import { BookOpen, GraduationCap, Zap, User, Mic, Flame, Snowflake, MessageCircle } from 'lucide-react';
import { haptic } from '../services/hapticService';
import { MASCOT_CONFIG } from './mascot/mascotConfig';

const MASCOT_HORIZONTAL_OFFSET_PX = MASCOT_CONFIG.horizontalOffsetPx;

interface NavbarProps {
  hasUnsyncedSettings?: boolean;
  quizCompletedToday?: boolean;
  streak?: number;
  isStreakBroken?: boolean;
  onStreakClick?: () => void;
}

export function Navbar({ hasUnsyncedSettings, quizCompletedToday, streak, isStreakBroken, onStreakClick }: NavbarProps) {
  const location = useLocation();
  
  const tabs = [
    { path: '/vocab', icon: BookOpen, label: 'Vocab' },
    { path: '/study', icon: GraduationCap, label: 'Study' },
    { path: '/quiz', icon: Zap, label: 'Quiz', quizStatus: quizCompletedToday },
    { path: '/pinyin', icon: Mic, label: 'Pinyin' },
    { path: '/chat', icon: MessageCircle, label: 'Chat' },
    { path: '/profile', icon: User, label: 'Profile', showBadge: hasUnsyncedSettings },
  ];

  const showStreak = streak !== undefined && streak >= 0;
  // Colored (lit) only when the streak is alive AND today's quiz is done.
  // If today isn't done yet, keep showing the current streak number but leave
  // the badge greyed out as a nudge to practice.
  const litToday = !isStreakBroken && (streak ?? 0) > 0 && !!quizCompletedToday;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 z-50">
      {/* Streak badge row */}
      {showStreak && (
        <button
          onClick={onStreakClick}
          // Nudged right of centre so it clears the mascot, which sits in a band
          // directly above and is nudged left by the same amount. Keep in sync
          // with MASCOT_CONFIG.horizontalOffsetPx.
          style={{ marginLeft: MASCOT_HORIZONTAL_OFFSET_PX }}
          className="absolute -top-5 left-1/2 -translate-x-1/2 z-10"
        >
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full shadow-lg border transition-all active:scale-95 ${
            isStreakBroken
              ? 'bg-base-300 border-base-content/20 text-base-content/50'
              : litToday
                // Duolingo streak flame: Fox -> Bee (design.duolingo.com/identity/color)
                ? 'bg-gradient-to-r from-[#FF9600] to-[#FFC800] border-[#FF9600]/40 text-white'
                : 'bg-base-300 border-base-content/20 text-base-content/60'
          }`}>
            {isStreakBroken ? (
              <Snowflake className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Flame className={`w-3.5 h-3.5 ${litToday ? 'drop-shadow-sm' : ''}`} />
            )}
            <span className="text-xs font-bold tabular-nums">{streak}</span>
          </div>
        </button>
      )}

      <div className="flex justify-around items-center h-16 max-w-lg mx-auto safe-area-inset-bottom">
        {tabs.map(({ path, icon: Icon, label, showBadge, quizStatus }) => {
          const isActive = location.pathname === path;
          
          return (
            <Link
              key={path}
              to={path}
              data-active={isActive}
              onClick={() => haptic('tap')}
              className={`nav-tab flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive 
                  ? 'text-primary bg-base-300/50' 
                  : 'text-base-content/60 hover:text-base-content'
              }`}
            >
              <div className="relative">
                <Icon className="nav-tab-icon w-6 h-6" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full" />
                )}
                {quizStatus !== undefined && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                    quizStatus ? 'bg-success' : 'bg-error'
                  }`} />
                )}
              </div>
              <span className={`text-xs mt-1 transition-all ${isActive ? 'font-bold' : ''}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
