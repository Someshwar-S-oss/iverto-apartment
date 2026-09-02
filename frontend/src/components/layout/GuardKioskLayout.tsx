import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  Clock,
  LogOut,
  Building,
  User as UserIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { BRAND_CONFIG } from '../../constants/branding';

export interface GuardKioskLayoutProps {
  children?: React.ReactNode;
}

export const GuardKioskLayout: React.FC<GuardKioskLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeContext } = useRole();
  const { isConnected } = useRealtime();

  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const gateName = activeContext?.label || 'Main Security Gate';
  const societyName = activeContext?.societyName || 'Society Access Point';
  const guardName = user?.name || 'Security Guard';

  const handleExitKiosk = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans select-none">
      {/* High-Contrast Guard Top Status Bar */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-4">
        {/* Left: Gate & Society Name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center p-1 shadow-md shadow-pink-900/20 shrink-0">
            <img
              src={BRAND_CONFIG.logoIcon}
              alt={BRAND_CONFIG.name}
              className="w-8 h-8 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = BRAND_CONFIG.logoIconLocal;
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg text-white tracking-wide truncate">
                {gateName}
              </span>
              <span className="text-[10px] bg-[#cd0447]/20 border border-[#cd0447]/40 text-pink-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Guard Kiosk
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 truncate">
              <Building className="w-3.5 h-3.5" />
              <span className="truncate">{societyName}</span>
            </div>
          </div>
        </div>

        {/* Center: Live Real-time Clock */}
        <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gray-950/80 border border-gray-800 text-white font-mono text-lg font-bold tracking-widest shadow-inner">
          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>{currentTime || '00:00:00'}</span>
        </div>

        {/* Right: Guard Info + WebSocket Health + Exit */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* WebSocket Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
              isConnected
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                : 'bg-rose-950/50 border-rose-800 text-rose-400 animate-pulse'
            }`}
            title={isConnected ? 'Gate link online' : 'Gate link offline'}
          >
            {isConnected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {/* Guard Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-800/80 border border-gray-700 text-xs font-medium text-gray-200">
            <UserIcon className="w-3.5 h-3.5 text-gray-400" />
            <span className="truncate max-w-[120px]">{guardName}</span>
          </div>

          {/* Exit Kiosk Button */}
          <button
            type="button"
            onClick={handleExitKiosk}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-rose-900/60 text-gray-300 hover:text-rose-200 border border-gray-700 hover:border-rose-700 text-xs font-bold transition-all cursor-pointer"
            title="Exit Guard Console"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Touch-Optimized Kiosk Viewport */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default GuardKioskLayout;
