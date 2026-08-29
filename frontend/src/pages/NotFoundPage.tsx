import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Home, ArrowLeft, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { getPrimaryRedirectPath } = useRole();

  const handleReturnHome = () => {
    if (isAuthenticated) {
      navigate(getPrimaryRedirectPath(), { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="login-bg min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 relative selection:bg-[#cd0447]/10 selection:text-[#cd0447]">
      {/* Background Decorative Grid */}
      <div className="login-grid" aria-hidden="true" />

      {/* Decorative Glowing Orbs */}
      <div
        className="login-orb w-80 h-80 sm:w-96 sm:h-96 -top-20 -left-20 bg-pink-500/20"
        aria-hidden="true"
      />
      <div
        className="login-orb w-80 h-80 sm:w-96 sm:h-96 -bottom-20 -right-20 bg-rose-400/20"
        aria-hidden="true"
      />

      {/* Main Card */}
      <div className="w-full max-w-lg relative z-10 animate-fade-in-up">
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/80 text-center">
          {/* 404 Glitch / Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 font-mono text-xs font-bold uppercase tracking-widest mb-6 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#cd0447]" />
            <span>Error 404 &bull; Page Not Found</span>
          </div>

          {/* Large Visual Display */}
          <div className="relative mb-6">
            <div className="text-8xl sm:text-9xl font-black tracking-tighter text-gray-200/80 select-none font-mono">
              404
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#cd0447] to-[#e91e63] text-white flex items-center justify-center shadow-lg shadow-pink-500/30">
                <ShieldAlert className="w-10 h-10 stroke-[2]" />
              </div>
            </div>
          </div>

          {/* Descriptive Content */}
          <div className="space-y-2 mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Lost in Access Space
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              The page or resource you are looking for doesn't exist, has been relocated, or is restricted in your current workspace context.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary w-full sm:w-auto text-sm font-medium py-2.5 px-5 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go Back</span>
            </button>

            <button
              type="button"
              onClick={handleReturnHome}
              className="btn-primary w-full sm:w-auto text-sm font-semibold py-2.5 px-6 flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </button>
          </div>

          {/* Context Note */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400">
            iverto Gate & Community Access Platform
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
