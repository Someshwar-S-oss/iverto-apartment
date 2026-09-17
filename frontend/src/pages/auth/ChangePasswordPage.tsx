import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';
import AuthCanvas from '../../components/layout/AuthCanvas';

export const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, changePassword, logout } = useAuth();
  const { fetchContexts, getPrimaryRedirectPath } = useRole();
  const { success } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [errorShakeKey, setErrorShakeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Criteria validation checks
  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isMatching = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);

  const isFormValid = hasMinLength && hasLetter && hasNumber && isMatching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!hasMinLength) {
      setErrorMessage('Password must be at least 8 characters long.');
      setErrorShakeKey((prev) => prev + 1);
      return;
    }

    if (!hasLetter || !hasNumber) {
      setErrorMessage('Password must contain at least one letter and one number.');
      setErrorShakeKey((prev) => prev + 1);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      setErrorShakeKey((prev) => prev + 1);
      return;
    }

    setIsLoading(true);

    try {
      const res = await changePassword(newPassword);
      setIsSuccess(true);
      success(res.message || 'Password successfully updated!');

      // Refresh application contexts after password change with new credentials
      const updatedUser = res.user || user;
      const contexts = await fetchContexts(updatedUser, res.accessToken);
      const nextPath = getPrimaryRedirectPath(contexts[0] || null, updatedUser);

      // Brief delay for positive feedback before navigating
      setTimeout(() => {
        navigate(nextPath, { replace: true });
      }, 1000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to change password. Please ensure it meets security guidelines and try again.';
      setErrorMessage(msg);
      setErrorShakeKey((prev) => prev + 1);
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[var(--canvas)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <AuthCanvas variant="grid" fade="center" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        {/* Brand / Header */}
        <div className="mb-7 text-center">
          <div className="inline-grid h-14 w-14 place-items-center rounded-[var(--r-lg)] bg-gradient-to-br from-[#cd0447] to-[#e91e63] text-white shadow-[0_10px_24px_-10px_rgba(205,4,71,0.7)]">
            <KeyRound className="h-7 w-7 stroke-[2.1]" />
          </div>
          <div className="mt-5 flex items-center justify-center gap-3">
            <span className="h-px w-6 bg-[var(--brand)]/45" />
            <span className="eyebrow eyebrow-brand text-[10px]">One step remaining</span>
            <span className="h-px w-6 bg-[var(--brand)]/45" />
          </div>
          <h1 className="display mt-4 text-[1.75rem] sm:text-3xl">Set a permanent password</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-500)]">
            You signed in with temporary credentials. Choose a new password to unlock
            your dashboard.
          </p>
        </div>

        {/* Change Password Card */}
        <div className="edge-brand rounded-[var(--r-xl)] border border-[var(--line)] bg-white p-6 shadow-[var(--e4)] sm:p-8">
          {/* User Identifier Tile */}
          {user?.email && (
            <div className="well mb-6 flex items-center justify-between gap-3 p-3 text-xs">
              <span className="eyebrow text-[10px]">Account</span>
              <span className="truncate font-mono font-semibold text-[var(--ink-800)]">
                {user.email}
              </span>
            </div>
          )}

          {/* Success Banner */}
          {isSuccess && (
            <div className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2.5 animate-scale-in">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="flex-1 font-medium">
                Password updated successfully! Redirecting to your dashboard...
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && !isSuccess && (
            <div
              key={errorShakeKey}
              className="animate-shake mb-5 p-3.5 rounded-xl bg-rose-50/95 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5 shadow-sm"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* New Password Field */}
            <div>
              <label htmlFor="new-password" className="field-label field-required">
                New password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--ink-400)]">
                  <Lock className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading || isSuccess}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="field field-lg field-icon-l field-icon-r"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-[var(--ink-400)] transition-colors hover:text-[var(--ink-700)] focus-visible:text-[var(--ink-700)] cursor-pointer"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirm-password" className="field-label field-required">
                Confirm new password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--ink-400)]">
                  <Lock className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading || isSuccess}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="field field-lg field-icon-l field-icon-r"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-[var(--ink-400)] transition-colors hover:text-[var(--ink-700)] focus-visible:text-[var(--ink-700)] cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Password Criteria Checklist */}
            <div className="well space-y-2 p-3.5 text-xs">
              <div className="eyebrow text-[10px]">Password requirements</div>
              <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                <div
                  className={`flex items-center gap-2 transition-colors ${
                    hasMinLength ? 'text-emerald-700 font-medium' : 'text-gray-500'
                  }`}
                >
                  {hasMinLength ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />
                  )}
                  <span>At least 8 characters</span>
                </div>

                <div
                  className={`flex items-center gap-2 transition-colors ${
                    hasLetter ? 'text-emerald-700 font-medium' : 'text-gray-500'
                  }`}
                >
                  {hasLetter ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />
                  )}
                  <span>Contains at least one letter (a-z / A-Z)</span>
                </div>

                <div
                  className={`flex items-center gap-2 transition-colors ${
                    hasNumber ? 'text-emerald-700 font-medium' : 'text-gray-500'
                  }`}
                >
                  {hasNumber ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />
                  )}
                  <span>Contains at least one number (0-9)</span>
                </div>

                {confirmPassword && (
                  <div
                    className={`flex items-center gap-2 transition-colors ${
                      isMatching ? 'text-emerald-700 font-medium' : 'text-rose-600 font-medium'
                    }`}
                  >
                    {isMatching ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span>{isMatching ? 'Passwords match' : 'Passwords do not match'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || isSuccess || !isFormValid}
                className="btn-primary btn-lg btn-block"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <span>Set Password & Proceed</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Sign Out Option */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-center">
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out and return to login</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
