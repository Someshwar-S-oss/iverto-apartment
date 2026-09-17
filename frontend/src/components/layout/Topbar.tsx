import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Bell,
  ChevronDown,
  Building2,
  Home,
  ShieldCheck,
  Globe,
  KeyRound,
  LogOut,
  User as UserIcon,
  Check,
  Loader2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import type { AppContext } from '../../api/types';

export interface TopbarProps {
  onMobileMenuToggle?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onMobileMenuToggle }) => {
  const navigate = useNavigate();
  const { user, logout, changePassword } = useAuth();
  const { contexts, activeContext, switchContext, getPrimaryRedirectPath } = useRole();
  const { isConnected } = useRealtime();
  const toast = useToast();

  const [isContextDropdownOpen, setIsContextDropdownOpen] = useState<boolean>(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const contextDropdownRef = useRef<HTMLDivElement | null>(null);
  const profileDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextDropdownRef.current &&
        !contextDropdownRef.current.contains(event.target as Node)
      ) {
        setIsContextDropdownOpen(false);
      }
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleContextSwitch = (ctx: AppContext) => {
    setIsContextDropdownOpen(false);
    const updated = switchContext(ctx.id);
    if (updated) {
      toast.info(`Switched context to ${ctx.label}`);
      const redirect = getPrimaryRedirectPath(updated);
      navigate(redirect);
    }
  };

  const handleLogout = () => {
    setIsProfileDropdownOpen(false);
    logout();
    navigate('/login');
    toast.info('Logged out successfully');
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(newPassword);
      toast.success('Password updated successfully');
      setIsChangePasswordOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(
        err.response?.data?.message || err.message || 'Failed to update password',
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getContextIcon = (type: string) => {
    switch (type) {
      case 'GLOBAL':
        return <Globe className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'SOCIETY':
        return <Building2 className="w-4 h-4 text-sky-600 shrink-0" />;
      case 'GATE':
        return <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'UNIT':
      default:
        return <Home className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[var(--line)] bg-white/85 px-4 backdrop-blur-xl backdrop-saturate-150 sm:px-6">
        {/* Left Side: Mobile Menu Button & Context Selector */}
        <div className="flex items-center gap-3 min-w-0">
          {onMobileMenuToggle && (
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="icon-btn -ml-1 md:hidden"
              aria-label="Open mobile navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Context Selector Dropdown */}
          <div className="relative" ref={contextDropdownRef}>
            <button
              type="button"
              onClick={() => setIsContextDropdownOpen((prev) => !prev)}
              className="flex max-w-[240px] cursor-pointer items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-white py-1.5 pl-2 pr-3 text-left shadow-[var(--e1)] transition-all hover:border-[var(--line-strong)] hover:shadow-[var(--e2)] sm:max-w-xs md:max-w-sm"
              aria-expanded={isContextDropdownOpen}
              aria-haspopup="listbox"
            >
              {activeContext ? (
                <>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-xs)] bg-[var(--ink-50)] ring-1 ring-[var(--line)]">
                    {getContextIcon(activeContext.type)}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-semibold text-[var(--ink-900)]">
                      {activeContext.label}
                    </span>
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)]">
                      {activeContext.role}
                    </span>
                  </span>
                </>
              ) : (
                <span className="px-1 text-sm text-[var(--ink-500)]">Select context</span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-400)] transition-transform ${
                  isContextDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isContextDropdownOpen && (
              <div className="animate-scale-in absolute left-0 z-50 mt-2 w-72 rounded-[var(--r-lg)] border border-[var(--line)] bg-white py-2 shadow-[var(--e4)] sm:w-80">
                <div className="px-4 py-1.5">
                  <span className="eyebrow text-[10px]">Switch active context</span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 p-1">
                  {contexts.map((ctx) => {
                    const isSelected = activeContext?.id === ctx.id;
                    return (
                      <button
                        key={ctx.id}
                        type="button"
                        onClick={() => handleContextSwitch(ctx)}
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--r-sm)] px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-[var(--brand-50)] font-semibold text-[var(--brand)]'
                            : 'text-[var(--ink-700)] hover:bg-[var(--ink-50)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {getContextIcon(ctx.type)}
                          <div className="truncate">
                            <div className="truncate font-medium">{ctx.label}</div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-500)]">
                              {ctx.role}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-[#cd0447] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Connection Status + Notifications + Profile */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Real-time Connection Status Dot */}
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
              isConnected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
            title={isConnected ? 'Real-time WebSocket Live' : 'Connecting to real-time service'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-500 pulse-green'
                  : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="hidden sm:inline">
              {isConnected ? 'Live' : 'Connecting'}
            </span>
          </div>

          {/* Notification Bell */}
          <button
            type="button"
            className="icon-btn relative"
            aria-label="View notifications"
            onClick={() => toast.info('No new notifications')}
          >
            <Bell className="w-5 h-5" />
            <span className="sr-only">Notifications</span>
          </button>

          {/* User Profile Pill & Dropdown */}
          <div className="relative" ref={profileDropdownRef}>
            <button
              type="button"
              onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
              className="flex cursor-pointer items-center gap-2.5 rounded-full border border-[var(--line)] bg-white p-1 shadow-[var(--e1)] transition-all hover:border-[var(--line-strong)] hover:shadow-[var(--e2)] sm:py-1 sm:pl-1 sm:pr-3"
              aria-expanded={isProfileDropdownOpen}
              aria-haspopup="menu"
            >
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#cd0447] to-[#e91e63] text-xs font-bold text-white shadow-[0_4px_10px_-4px_rgba(205,4,71,0.8)]">
                {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="max-w-[110px] truncate text-[13px] font-semibold text-[var(--ink-900)]">
                  {user?.name || 'User'}
                </span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-500)]">
                  {user?.isSuperadmin
                    ? 'Superadmin'
                    : activeContext?.role || 'Resident'}
                </span>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-[var(--ink-400)] sm:block" />
            </button>

            {/* Profile Dropdown */}
            {isProfileDropdownOpen && (
              <div className="animate-scale-in absolute right-0 z-50 mt-2 w-60 rounded-[var(--r-lg)] border border-[var(--line)] bg-white py-2 shadow-[var(--e4)]">
                <div className="border-b border-[var(--line)] px-4 pb-3 pt-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink-900)]">
                    {user?.name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--ink-500)]">{user?.email}</p>
                  {user?.isSuperadmin && (
                    <div className="mt-1">
                      <Badge variant="purple" size="sm">
                        Superadmin
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileDropdownOpen(false);
                      setIsChangePasswordOpen(true);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ink-700)] transition-colors hover:bg-[var(--ink-50)]"
                  >
                    <KeyRound className="h-4 w-4 text-[var(--ink-400)]" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => !isChangingPassword && setIsChangePasswordOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#cd0447]" />
            <span>Change Account Password</span>
          </div>
        }
        size="sm"
      >
        <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
          {passwordError && (
            <div className="rounded-[var(--r-md)] border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {passwordError}
            </div>
          )}

          <div>
            <label className="field-label field-required">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              disabled={isChangingPassword}
              className="field"
            />
          </div>

          <div>
            <label className="field-label field-required">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              minLength={8}
              disabled={isChangingPassword}
              className="field"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[var(--line)] pt-4">
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(false)}
              disabled={isChangingPassword}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isChangingPassword}
              className="btn-primary"
            >
              {isChangingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Update Password</span>
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default Topbar;
