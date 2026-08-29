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

      // Refresh application contexts after password change
      const contexts = await fetchContexts();
      const nextPath = getPrimaryRedirectPath(contexts[0], res.user || user);

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
    <div className="login-bg min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 relative selection:bg-[#cd0447]/10 selection:text-[#cd0447]">
      {/* Background Decorative Grid */}
      <div className="login-grid" aria-hidden="true" />

      {/* Background Glowing Orbs */}
      <div
        className="login-orb w-80 h-80 sm:w-96 sm:h-96 -top-20 -left-20 bg-pink-500/25"
        aria-hidden="true"
      />
      <div
        className="login-orb w-80 h-80 sm:w-96 sm:h-96 -bottom-20 -right-20 bg-rose-400/20"
        aria-hidden="true"
      />
      <div
        className="login-orb w-64 h-64 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-200/20"
        aria-hidden="true"
      />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        {/* Brand / Header */}
        <div className="text-center mb-6 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#cd0447] to-[#e91e63] text-white shadow-lg shadow-pink-500/25 mb-2 hover:scale-105 transition-transform duration-200">
            <KeyRound className="w-7 h-7 stroke-[2.2]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 font-sans">
            Set Permanent Password
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto">
            You are logged in with temporary credentials. For security, please set a new password before accessing your dashboard.
          </p>
        </div>

        {/* Change Password Card */}
        <div className="glass rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/80">
          {/* User Identifier Tile */}
          {user?.email && (
            <div className="mb-5 p-3 rounded-xl bg-gray-50/80 border border-gray-200/80 flex items-center justify-between text-xs">
              <span className="text-gray-500">Account:</span>
              <span className="font-semibold text-gray-800 font-mono truncate max-w-[200px]">
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
              <label
                htmlFor="new-password"
                className="field-label field-required text-xs font-semibold text-gray-700 uppercase tracking-wider"
              >
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading || isSuccess}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="field pl-10 pr-10 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
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
              <label
                htmlFor="confirm-password"
                className="field-label field-required text-xs font-semibold text-gray-700 uppercase tracking-wider"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading || isSuccess}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="field pl-10 pr-10 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
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
            <div className="p-3.5 rounded-xl bg-gray-50/90 border border-gray-200/80 space-y-2 text-xs">
              <div className="font-semibold text-gray-700">Password Requirements:</div>
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
                className="btn-primary w-full py-3 text-sm font-semibold shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
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
