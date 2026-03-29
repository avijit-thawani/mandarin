import { Link, useLocation } from 'react-router-dom';
import { BookOpen, GraduationCap, Zap, User, Layers, Mic, Flame, Snowflake } from 'lucide-react';

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
    { path: '/syntax', icon: Layers, label: 'Syntax' },
    { path: '/profile', icon: User, label: 'Profile', showBadge: hasUnsyncedSettings },
  ];

  const showStreak = streak !== undefined && streak >= 0;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-base-200 border-t border-base-300 z-50">
      {/* Streak badge row */}
      {showStreak && (
        <button
          onClick={onStreakClick}
          className="absolute -top-5 left-1/2 -translate-x-1/2 z-10"
        >
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full shadow-lg border transition-all active:scale-95 ${
            isStreakBroken
              ? 'bg-base-300 border-base-content/20 text-base-content/50'
              : streak! > 0
                ? 'bg-gradient-to-r from-orange-500 to-amber-400 border-orange-600/30 text-white'
                : 'bg-base-300 border-base-content/20 text-base-content/60'
          }`}>
            {isStreakBroken ? (
              <Snowflake className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Flame className={`w-3.5 h-3.5 ${streak! > 0 ? 'drop-shadow-sm' : ''}`} />
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
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive 
                  ? 'text-primary bg-base-300/50' 
                  : 'text-base-content/60 hover:text-base-content'
              }`}
            >
              <div className="relative">
                <Icon className="w-6 h-6" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full" />
                )}
                {quizStatus !== undefined && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                    quizStatus ? 'bg-success' : 'bg-error'
                  }`} />
                )}
              </div>
              <span className="text-xs mt-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
