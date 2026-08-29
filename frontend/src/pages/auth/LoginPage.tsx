import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';

const REMEMBERED_EMAIL_KEY = 'iverto_remembered_email';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { fetchContexts, getPrimaryRedirectPath } = useRole();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorShakeKey, setErrorShakeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize remembered email if previously saved
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {
      // ignore storage error
    }
  }, []);

  const validateForm = (): boolean => {
    let isValid = true;
    setEmailError('');
    setPasswordError('');
    setErrorMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Email or username is required');
      isValid = false;
    } else if (trimmedEmail.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const trimmedEmail = email.trim();
      const res = await login(trimmedEmail, password);

      // Handle remember me preference
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, trimmedEmail);
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      } catch {
        // ignore storage error
      }

      if (res.mustChangePassword) {
        navigate('/force-change-password', { replace: true });
        return;
      }

      const contexts = await fetchContexts(res.user, res.accessToken);
      const fromPath = (location.state as any)?.from?.pathname;
      if (fromPath && fromPath !== '/login' && fromPath !== '/force-change-password') {
        navigate(fromPath, { replace: true });
      } else {
        const redirectPath = getPrimaryRedirectPath(contexts[0] || null, res.user);
        navigate(redirectPath, { replace: true });
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Invalid email or password. Please check your credentials and try again.';
      setErrorMessage(message);
      setErrorShakeKey((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-bg min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 relative selection:bg-[#cd0447]/10 selection:text-[#cd0447]">
      {/* Background Decorative Grid */}
      <div className="login-grid" aria-hidden="true" />

      {/* Background Decorative Glowing Orbs */}
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
        {/* Brand Header */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#cd0447] to-[#e91e63] text-white shadow-lg shadow-pink-500/25 mb-2 hover:scale-105 transition-transform duration-200">
            <Shield className="w-7 h-7 stroke-[2.2]" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 font-sans">
            iverto
          </h1>
          <p className="text-sm font-medium text-gray-500 tracking-wide">
            Gate & Community Access Management
          </p>
        </div>

        {/* Login Card */}
        <div className="glass rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/80">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-xs text-gray-500 mt-1">
              Sign in with your registered account credentials to continue
            </p>
          </div>

          {/* Error Banner with Shake Animation */}
          {errorMessage && (
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
            {/* Email Field */}
            <div>
              <label
                htmlFor="login-email"
                className="field-label field-required text-xs font-semibold text-gray-700 uppercase tracking-wider"
              >
                Email or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  disabled={isLoading}
                  placeholder="name@example.com"
                  autoComplete="username"
                  className={`field pl-10 pr-3 py-2.5 text-sm ${emailError ? 'field-invalid' : ''}`}
                />
              </div>
              {emailError && <p className="field-error">{emailError}</p>}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="login-password"
                  className="field-label field-required text-xs font-semibold text-gray-700 uppercase tracking-wider !mb-0"
                >
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  disabled={isLoading}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`field pl-10 pr-10 py-2.5 text-sm ${passwordError ? 'field-invalid' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {passwordError && <p className="field-error">{passwordError}</p>}
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2.5 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                  className="w-4 h-4 rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447] accent-[#cd0447] cursor-pointer"
                />
                <span>Remember me</span>
              </label>

              <span className="text-[11px] text-gray-400 flex items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3 text-[#cd0447]" />
                Secure Portal
              </span>
            </div>

            {/* Submit Button */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-3 text-sm font-semibold shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Subtitle / Helper Information */}
          <div className="mt-6 pt-5 border-t border-gray-100/80 text-center">
            <p className="text-xs text-gray-400 leading-relaxed">
              First time logging in with a temporary passcode?
              <br />
              You will be prompted to set a permanent password.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-gray-400">
          &copy; {new Date().getFullYear()} iverto Platform. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
