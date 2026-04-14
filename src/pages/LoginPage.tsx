// Login page for Supabase authentication
import { useState } from 'react';
import { LogIn, AlertCircle, Loader2, Zap } from 'lucide-react';

const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || '';
const DEV_USER_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD || '';
const IS_DEV = import.meta.env.MODE === 'development';
const IS_LOCALHOST = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error: string | null }>;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
}

export function LoginPage({ onLogin, loading, error, onClearError }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await onLogin(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base-300 via-base-100 to-base-300 p-4">
      <div className="card bg-base-100 shadow-2xl w-full max-w-md">
        <div className="card-body">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-primary mb-2">🪕 Saras</h1>
            <p className="text-base-content/60">Mandarin Chinese Learning</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert alert-error mb-4">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
              <button 
                className="btn btn-ghost btn-xs"
                onClick={onClearError}
              >
                ✕
              </button>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Email</span>
              </label>
              <input
                type="email"
                placeholder="your@email.com"
                className="input input-bordered w-full"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Password</span>
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered w-full"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full mt-6"
              disabled={loading || !email || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Invite-only notice */}
          <div className="text-center mt-6">
            <div className="alert alert-info py-3">
              <div className="text-left">
                <p className="font-medium text-sm">🔒 Access is invite-only</p>
                <p className="text-xs opacity-80 mt-1">
                  Want to join?{' '}
                  <a 
                    href="https://github.com/avi-otterai/mandarin/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-hover font-medium"
                  >
                    Open an issue on GitHub
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Dev Mode Quick Login (localhost only) */}
          {IS_DEV && IS_LOCALHOST && DEV_USER_EMAIL && DEV_USER_PASSWORD && (
            <div className="mt-6 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-warning" />
                <span className="text-xs font-bold text-warning">DEV MODE</span>
              </div>
              <button
                onClick={() => onLogin(DEV_USER_EMAIL, DEV_USER_PASSWORD)}
                className="btn btn-xs btn-warning w-full"
                disabled={loading}
              >
                Dev User Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
