import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  BellRing,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { BRAND_CONFIG } from '../../constants/branding';
import AuthCanvas from '../../components/layout/AuthCanvas';

const REMEMBERED_EMAIL_KEY = 'iverto_remembered_email';

/** What the platform actually does, stated plainly on the brand canvas. */
const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Verified at the gate',
    body: 'Guard kiosk and M50 face terminals check every visitor, delivery and helper before the gate opens.',
  },
  {
    icon: BellRing,
    title: 'Residents decide in real time',
    body: 'Arrivals ring straight through to the unit with a photo and a one-tap approve or deny.',
  },
  {
    icon: KeyRound,
    title: 'Passcodes, deliveries, staff',
    body: 'Time-boxed guest codes, tracked handovers and a daily roster for domestic staff.',
  },
];

const ASSURANCES = ['Role-scoped access', 'Audit-logged entries', 'Encrypted in transit'];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { fetchContexts, getPrimaryRedirectPath } = useRole();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

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

  const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setIsCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  return (
    <div className="min-h-screen w-full bg-white lg:grid lg:grid-cols-2 xl:grid-cols-[1.08fr_1fr]">
      {/* ==========================================================
          LEFT — brand canvas. Structural grid field, ambient brand
          light and a slow scan sweep, framed by corner brackets.
          ========================================================== */}
      <section
        className="relative hidden lg:flex flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--canvas)] p-12 xl:p-16"
        style={{
          ['--field-size' as string]: '40px',
          ['--field-line' as string]: 'rgba(20, 22, 26, 0.075)',
        }}
      >
        <AuthCanvas variant="grid" fade="center" scan />

        {/* Corner frame — sits between the panel edge and the content column */}
        <div className="pointer-events-none absolute inset-8 z-[1] xl:inset-10" aria-hidden="true">
          <span className="absolute left-0 top-0 h-9 w-9 border-l border-t border-[var(--brand)]/30" />
          <span className="absolute right-0 top-0 h-9 w-9 border-r border-t border-[var(--brand)]/30" />
          <span className="absolute bottom-0 left-0 h-9 w-9 border-b border-l border-[var(--brand)]/30" />
          <span className="absolute bottom-0 right-0 h-9 w-9 border-b border-r border-[var(--brand)]/30" />
        </div>

        <div className="relative z-10 flex h-full flex-col justify-between">
          {/* Wordmark */}
          <div>
            <img
              src={BRAND_CONFIG.logoFull}
              alt={BRAND_CONFIG.name}
              className="h-9 max-w-[210px] object-contain object-left"
              onError={(e) => {
                (e.target as HTMLImageElement).src = BRAND_CONFIG.logoFullLocal;
              }}
            />
          </div>

          {/* Headline + capability spine */}
          <div className="flex max-w-xl flex-1 flex-col justify-center py-8">
            <div className="flex items-center gap-3 animate-rise" style={{ animationDelay: '60ms' }}>
              <span className="h-px w-9 bg-[var(--brand)]/45" />
              <span className="eyebrow eyebrow-brand">Gate &amp; community access</span>
            </div>

            <h1
              className="display mt-6 text-[2.5rem] xl:text-[3rem] text-balance animate-rise"
              style={{ animationDelay: '120ms' }}
            >
              Every arrival,
              <br />
              accounted for.
            </h1>

            <p
              className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink-600)] animate-rise"
              style={{ animationDelay: '180ms' }}
            >
              One console for society admins, gate guards and residents — from unit
              records and staff rosters to the live entry stream.
            </p>

            {/* Spine: a connector rail threading the three capability tiles */}
            <div className="relative mt-12">
              <span
                className="absolute left-[1.4375rem] top-6 bottom-6 w-px bg-gradient-to-b from-[var(--brand)]/25 via-[var(--ink-200)] to-transparent"
                aria-hidden="true"
              />
              <ul className="space-y-7">
                {CAPABILITIES.map((cap, i) => {
                  const Icon = cap.icon;
                  return (
                    <li
                      key={cap.title}
                      className="relative flex gap-5 animate-rise"
                      style={{ animationDelay: `${240 + i * 90}ms` }}
                    >
                      <div className="relative z-10 grid h-[2.875rem] w-[2.875rem] shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-white text-[var(--brand)] shadow-[var(--e2)]">
                        <Icon className="h-[1.15rem] w-[1.15rem] stroke-[1.9]" />
                      </div>
                      <div className="pt-1">
                        <div className="text-[0.9375rem] font-semibold text-[var(--ink-900)]">
                          {cap.title}
                        </div>
                        <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-[var(--ink-500)]">
                          {cap.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Assurances */}
          <div>
            <div className="rule-fade-brand" />
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              {ASSURANCES.map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-500)]"
                >
                  <span className="h-1 w-1 rounded-full bg-[var(--brand)]/60" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================================
          RIGHT — the form pane.
          ========================================================== */}
      <section className="relative flex min-h-screen flex-col overflow-hidden bg-white">
        {/* The form pane carries a quieter dot field so it reads as a surface
            rather than blank paper next to the textured brand canvas. */}
        <div
          className="bg-field bg-field-dots field-fade-bottom"
          style={{
            ['--field-size' as string]: '24px',
            ['--field-dot' as string]: 'rgba(20, 22, 26, 0.06)',
          }}
          aria-hidden="true"
        />
        <div className="lg:hidden">
          <AuthCanvas variant="dots" fade="top" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-[26.5rem]">
            {/* Mobile wordmark */}
            <div className="mb-8 flex flex-col items-center lg:hidden">
              <img
                src={BRAND_CONFIG.logoFull}
                alt={BRAND_CONFIG.name}
                className="h-10 max-w-[220px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = BRAND_CONFIG.logoFullLocal;
                }}
              />
              <p className="eyebrow mt-3 text-[10px]">{BRAND_CONFIG.tagline}</p>
            </div>

            {/* Form card — mirrors the boxed treatment used on the change-password
                and modal surfaces, so the auth flow reads as one consistent system
                instead of this pane floating free against the page background. */}
            <div className="edge-brand animate-scale-in relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-white p-6 shadow-[var(--e3)] sm:p-8">
              {/* Heading */}
              <header>
                <div className="flex items-center gap-3">
                  <span className="h-px w-6 bg-[var(--brand)]/50" />
                  <span className="eyebrow eyebrow-brand text-[10px]">Secure sign-in</span>
                </div>
                <h2 className="display mt-4 text-[1.75rem]">Welcome back</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
                  Use the credentials issued for your society, gate or unit.
                </p>
              </header>

              {/* Error banner */}
              {errorMessage && (
                <div
                  key={errorShakeKey}
                  className="animate-shake mt-6 flex items-start gap-3 rounded-[var(--r-md)] border border-rose-200 bg-rose-50 p-3.5 text-[0.8125rem] text-rose-800"
                  role="alert"
                >
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-rose-600" />
                  <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
                {/* Email / username */}
                <div className="animate-rise" style={{ animationDelay: '80ms' }}>
                  <label htmlFor="login-email" className="field-label field-required">
                    Email or username
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--ink-400)]">
                      <Mail className="h-[1.05rem] w-[1.05rem]" />
                    </span>
                    <input
                      id="login-email"
                      type="text"
                      inputMode="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError('');
                      }}
                      disabled={isLoading}
                      placeholder="name@example.com"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      className={`field field-lg field-icon-l ${emailError ? 'field-invalid' : ''}`}
                    />
                  </div>
                  {emailError && <p className="field-error">{emailError}</p>}
                </div>

                {/* Password */}
                <div className="animate-rise" style={{ animationDelay: '140ms' }}>
                  <label htmlFor="login-password" className="field-label field-required">
                    Password
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--ink-400)]">
                      <Lock className="h-[1.05rem] w-[1.05rem]" />
                    </span>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError) setPasswordError('');
                      }}
                      onKeyUp={trackCapsLock}
                      onKeyDown={trackCapsLock}
                      onBlur={() => setIsCapsLockOn(false)}
                      disabled={isLoading}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`field field-lg field-icon-l field-icon-r ${
                        passwordError ? 'field-invalid' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-[var(--ink-400)] transition-colors hover:text-[var(--ink-700)] focus-visible:text-[var(--ink-700)] cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-[1.05rem] w-[1.05rem]" />
                      ) : (
                        <Eye className="h-[1.05rem] w-[1.05rem]" />
                      )}
                    </button>
                  </div>
                  {passwordError && <p className="field-error">{passwordError}</p>}
                  {isCapsLockOn && !passwordError && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Caps Lock is on
                    </p>
                  )}
                </div>

                {/* Remember me */}
                <label
                  className="flex w-fit cursor-pointer select-none items-center gap-2.5 text-[0.8125rem] text-[var(--ink-600)] animate-rise"
                  style={{ animationDelay: '200ms' }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 cursor-pointer rounded border-[var(--ink-300)] accent-[#cd0447]"
                  />
                  <span>Remember this account</span>
                </label>

                {/* Submit */}
                <div className="pt-1 animate-rise" style={{ animationDelay: '260ms' }}>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary btn-lg btn-block"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        <span>Sign in</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* First-time helper */}
              <div className="mt-8 animate-rise" style={{ animationDelay: '320ms' }}>
                <div className="rule-fade" />
                <div className="mt-5 flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--ink-50)] p-3.5">
                  <KeyRound className="mt-px h-4 w-4 shrink-0 text-[var(--brand)]" />
                  <p className="text-xs leading-relaxed text-[var(--ink-500)]">
                    Signing in with a temporary passcode for the first time? You&apos;ll be
                    asked to set a permanent password before continuing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pane footer */}
        <footer className="relative z-10 px-5 pb-7 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-[26.5rem] flex-col items-center gap-1.5 text-center">
            <span className="text-[11px] text-[var(--ink-500)] lg:hidden">
              {ASSURANCES.join(' · ')}
            </span>
            <span className="text-[11px] text-[var(--ink-500)]">
              &copy; {new Date().getFullYear()} iverto.ai
            </span>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default LoginPage;
