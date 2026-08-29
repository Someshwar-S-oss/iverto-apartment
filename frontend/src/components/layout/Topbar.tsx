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
      <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 px-4 sm:px-6 flex items-center justify-between gap-4 transition-all">
        {/* Left Side: Mobile Menu Button & Context Selector */}
        <div className="flex items-center gap-3 min-w-0">
          {onMobileMenuToggle && (
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="md:hidden icon-btn text-gray-600 hover:text-gray-900 -ml-1 cursor-pointer"
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
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white/90 hover:bg-gray-50/90 text-gray-800 text-xs sm:text-sm font-medium transition-all shadow-2xs cursor-pointer max-w-[220px] sm:max-w-xs md:max-w-sm"
              aria-expanded={isContextDropdownOpen}
              aria-haspopup="listbox"
            >
              {activeContext ? (
                <>
                  {getContextIcon(activeContext.type)}
                  <span className="truncate text-left font-semibold">
                    {activeContext.label}
                  </span>
                </>
              ) : (
                <span className="text-gray-400">Select Context</span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
                  isContextDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isContextDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl glass shadow-xl border border-white/80 py-2 z-50 animate-scale-in">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Switch Active Context
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 p-1">
                  {contexts.map((ctx) => {
                    const isSelected = activeContext?.id === ctx.id;
                    return (
                      <button
                        key={ctx.id}
                        type="button"
                        onClick={() => handleContextSwitch(ctx)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#cd0447]/10 text-[#cd0447] font-semibold'
                            : 'hover:bg-gray-100/80 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {getContextIcon(ctx.type)}
                          <div className="truncate">
                            <div className="truncate font-medium">{ctx.label}</div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider">
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100/80 border border-gray-200 text-[11px] font-semibold text-gray-600"
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
            className="relative icon-btn text-gray-500 hover:text-gray-900 cursor-pointer"
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
              className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1 rounded-full border border-gray-200/80 bg-white hover:bg-gray-50 transition-all cursor-pointer"
              aria-expanded={isProfileDropdownOpen}
              aria-haspopup="menu"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#cd0447] to-[#e91e63] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="text-xs font-semibold text-gray-900 truncate max-w-[100px]">
                  {user?.name || 'User'}
                </span>
                <span className="text-[10px] text-gray-400 truncate">
                  {user?.isSuperadmin
                    ? 'Superadmin'
                    : activeContext?.role || 'Resident'}
                </span>
              </div>
              <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-gray-400" />
            </button>

            {/* Profile Dropdown */}
            {isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl glass shadow-xl border border-white/80 py-2 z-50 animate-scale-in">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
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
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-100/80 transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-gray-500" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm text-rose-600 hover:bg-rose-50/80 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
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
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
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
              className="field text-sm"
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
              className="field text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
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
