import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import AuthCanvas from '../components/layout/AuthCanvas';

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
    <div className="relative min-h-screen w-full overflow-hidden bg-[var(--canvas)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <AuthCanvas variant="grid" fade="center" />

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-lg animate-fade-in-up">
        <div
          className="bracket edge-brand rounded-[var(--r-xl)] border border-[var(--line)] bg-white p-8 text-center shadow-[var(--e4)] sm:p-11"
          style={{ ['--bracket-size' as string]: '34px' }}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-6 bg-[var(--brand)]/45" />
            <span className="eyebrow eyebrow-brand text-[10px]">Error 404</span>
            <span className="h-px w-6 bg-[var(--brand)]/45" />
          </div>

          {/* Numeral with the shield sitting in its counter */}
          <div className="relative mt-7 mb-7">
            <div className="select-none text-[6.5rem] font-bold leading-none tracking-[-0.06em] text-[var(--ink-100)] sm:text-[8rem]">
              404
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-[var(--r-lg)] bg-gradient-to-br from-[#cd0447] to-[#e91e63] text-white shadow-[0_14px_30px_-12px_rgba(205,4,71,0.75)]">
                <ShieldAlert className="h-9 w-9 stroke-[1.9]" />
              </div>
            </div>
          </div>

          {/* Descriptive Content */}
          <h1 className="display text-2xl sm:text-3xl">Nothing at this address</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--ink-500)]">
            The page you're after doesn't exist, has moved, or sits outside the
            workspace context you're currently signed into.
          </p>

          {/* Actions */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Go back</span>
            </button>

            <button
              type="button"
              onClick={handleReturnHome}
              className="btn-primary w-full sm:w-auto"
            >
              <Home className="h-4 w-4" />
              <span>Return to dashboard</span>
            </button>
          </div>

          {/* Context Note */}
          <div className="mt-9">
            <div className="rule-fade" />
            <p className="mt-5 text-[11px] text-[var(--ink-500)]">
              iverto.ai — Gate &amp; Community Access Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
