import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  UserPlus,
  Package,
  KeyRound,
  LogOut,
  Search,
  Phone,
  Clock,
  ShieldCheck,
  Building,
  AlertTriangle,
  RefreshCw,
  Truck,
  User as UserIcon,
  PhoneCall,
  X,
} from 'lucide-react';
import { guardApi } from '../../api/guard.api';
import type { Approval, UnitDirectoryItem } from '../../api/types';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useCache } from '../../context/CacheContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';
import { VisitorEntryModal } from './VisitorEntryModal';
import { DeliveryModal } from './DeliveryModal';
import { PasscodeModal } from './PasscodeModal';
import { ExitModal } from './ExitModal';
import { DecisionOverlay, DecisionData } from './DecisionOverlay';

const TOTAL_COUNTDOWN_SECONDS = 90;
const PENDING_KEY = (gateId: string) => `guard/kiosk/pending|gate:${gateId}`;

export const KioskPage: React.FC = () => {
  const { activeContext } = useRole();
  const { lastEvent } = useRealtime();
  const cache = useCache();

  const gateId =
    activeContext?.gateId ||
    (activeContext?.type === 'GATE' ? activeContext.id : '') ||
    activeContext?.id ||
    '';

  const societyName = activeContext?.societyName || 'Community Gate';

  // Active Modals State
  const [isVisitorModalOpen, setIsVisitorModalOpen] = useState<boolean>(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState<boolean>(false);
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState<boolean>(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState<boolean>(false);

  // Pre-selected flat for modals initiated from Directory quick-action
  const [preSelectedUnit, setPreSelectedUnit] = useState<{
    unitId: string;
    unitNumber: string;
  } | null>(null);

  // Decision Overlay State (Fullscreen Green/Red Flip)
  const [activeDecision, setActiveDecision] = useState<DecisionData | null>(null);

  // Directory Search State
  const [directoryQuery, setDirectoryQuery] = useState<string>('');
  const [directoryItems, setDirectoryItems] = useState<UnitDirectoryItem[]>([]);
  const [isSearchingDirectory, setIsSearchingDirectory] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Pending Approvals State (Real-time & 5s Polling)
  const [countdownTimers, setCountdownTimers] = useState<Record<string, number>>({});

  const pendingKey = useMemo(() => PENDING_KEY(gateId || 'none'), [gateId]);

  const {
    data: pendingData,
    isLoading: isLoadingPending,
    isRefreshing: isRefreshingPending,
    refetch: refetchPending,
  } = useCachedFetch<Approval[]>(
    pendingKey,
    () => guardApi.getPendingApprovals(gateId).then((approvals) => approvals || []),
    { deps: [gateId], skipInitialFetch: !gateId },
  );

  const pendingApprovals: Approval[] = useMemo(() => pendingData ?? [], [pendingData]);

  // Initialise countdown timers from approvals as they arrive.
  useEffect(() => {
    if (!pendingApprovals.length) return;
    setCountdownTimers((prev) => {
      const next: Record<string, number> = { ...prev };
      pendingApprovals.forEach((a) => {
        if (next[a.id] === undefined) {
          const elapsedSeconds = Math.floor(
            (Date.now() - new Date(a.createdAt).getTime()) / 1000,
          );
          const remaining = Math.max(0, TOTAL_COUNTDOWN_SECONDS - elapsedSeconds);
          next[a.id] = remaining;
        }
      });
      return next;
    });
  }, [pendingApprovals]);

  // 5s safety polling reuses the cached fetcher.
  useEffect(() => {
    if (!gateId) return;
    const interval = setInterval(() => {
      void refetchPending(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [gateId, refetchPending]);

  // 2. Countdown Timer tick every second
  useEffect(() => {
    const tickTimer = setInterval(() => {
      setCountdownTimers((prev) => {
        const updated: Record<string, number> = {};
        Object.entries(prev).forEach(([id, seconds]) => {
          updated[id] = Math.max(0, seconds - 1);
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(tickTimer);
  }, []);

  // 3. React to WebSocket Realtime Events
  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.name === 'approval.requested') {
      const data = lastEvent.data;
      const current = cache.get<Approval[]>(pendingKey)?.data ?? [];
      if (!current.some((a) => a.id === data.approvalId)) {
        const newApproval: Approval = {
          id: data.approvalId,
          entryEventId: data.entryEventId,
          unitId: data.unitId,
          status: 'PENDING',
          validUntil: data.expiresAt || new Date(Date.now() + 90000).toISOString(),
          createdAt: data.createdAt || new Date().toISOString(),
          visitorName: data.visitorName,
          visitorPhone: data.visitorPhone,
          subjectType: data.subjectType,
          platform: data.platform,
          unitNumber: data.unitNumber,
        };
        cache.set<Approval[]>(pendingKey, [newApproval, ...current], null);
      }

      setCountdownTimers((prev) => ({
        ...prev,
        [data.approvalId]: TOTAL_COUNTDOWN_SECONDS,
      }));
    } else if (lastEvent.name === 'approval.decided') {
      const data = lastEvent.data;

      // Remove from pending approvals list (write to cache).
      const current = cache.get<Approval[]>(pendingKey)?.data ?? [];
      cache.set<Approval[]>(
        pendingKey,
        current.filter((a) => a.id !== data.approvalId && a.entryEventId !== data.entryEventId),
        null,
      );

      // Trigger Fullscreen / Prominent Decision Overlay
      const isApproved =
        data.status === 'APPROVED' ||
        data.status === 'AUTO_APPROVED' ||
        data.mode === 'ALLOW_TO_DOOR' ||
        data.mode === 'LEAVE_AT_GATE';

      setActiveDecision({
        status: data.status,
        visitorName: data.visitorName,
        unitNumber: data.unitNumber,
        mode: data.mode,
        photoUrl: data.entryEventId ? guardApi.getVisitorPhotoUrl(data.entryEventId) : null,
        reason: isApproved ? 'Approved by resident' : 'Rejected by resident',
      });
    } else if (lastEvent.name === 'gate.event') {
      // Refresh pending approvals when gate events occur
      void refetchPending(true);
    }
  }, [lastEvent, refetchPending, pendingKey, cache]);

  // 4. Directory Search Query Handling (with 200ms debounce)
  useEffect(() => {
    if (!directoryQuery.trim() || !gateId) {
      setDirectoryItems([]);
      setIsSearchingDirectory(false);
      return;
    }

    setIsSearchingDirectory(true);
    const handler = setTimeout(async () => {
      try {
        const results = await guardApi.getDirectory(gateId, directoryQuery.trim());
        setDirectoryItems(results || []);
      } catch (err) {
        console.error('Failed to search directory:', err);
      } finally {
        setIsSearchingDirectory(false);
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [directoryQuery, gateId]);

  // 5. Global Keyboard Shortcuts Handler (1, 2, 3, 4, v, d, p, e, /)
  useEffect(() => {
    const isAnyModalOpen =
      isVisitorModalOpen ||
      isDeliveryModalOpen ||
      isPasscodeModalOpen ||
      isExitModalOpen ||
      Boolean(activeDecision);

    if (isAnyModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input element
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === '1' || key === 'v') {
        e.preventDefault();
        setPreSelectedUnit(null);
        setIsVisitorModalOpen(true);
      } else if (key === '2' || key === 'd') {
        e.preventDefault();
        setPreSelectedUnit(null);
        setIsDeliveryModalOpen(true);
      } else if (key === '3' || key === 'p') {
        e.preventDefault();
        setIsPasscodeModalOpen(true);
      } else if (key === '4' || key === 'e') {
        e.preventDefault();
        setIsExitModalOpen(true);
      } else if (key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isVisitorModalOpen,
    isDeliveryModalOpen,
    isPasscodeModalOpen,
    isExitModalOpen,
    activeDecision,
  ]);

  // Open visitor modal for pre-selected flat from directory
  const handleStartVisitorForUnit = (unit: UnitDirectoryItem) => {
    setPreSelectedUnit({
      unitId: unit.unitId,
      unitNumber: unit.unitNumber,
    });
    setIsVisitorModalOpen(true);
  };

  // Open delivery modal for pre-selected flat from directory
  const handleStartDeliveryForUnit = (unit: UnitDirectoryItem) => {
    setPreSelectedUnit({
      unitId: unit.unitId,
      unitNumber: unit.unitNumber,
    });
    setIsDeliveryModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in-up pb-8 max-w-7xl mx-auto w-full">
      {/* 1. Decision Overlay (Triggered automatically on decision) */}
      <DecisionOverlay
        decision={activeDecision}
        onDismiss={() => setActiveDecision(null)}
        autoDismissSeconds={6}
      />

      {/* 2. Four Giant Primary Action Cards */}
      <section aria-label="Quick Check-In Actions" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: Log Visitor Entry */}
        <button
          type="button"
          onClick={() => {
            setPreSelectedUnit(null);
            setIsVisitorModalOpen(true);
          }}
          className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#cd0447] to-[#9c0335] text-white shadow-xl shadow-[#cd0447]/20 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between text-left relative overflow-hidden group cursor-pointer border border-pink-400/30"
        >
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold group-hover:rotate-6 transition-transform">
              <UserPlus className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-mono font-bold bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-pink-100 border border-white/20">
              KEY [1] / [V]
            </span>
          </div>

          <div className="space-y-1 mt-6">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              Log Visitor
            </h2>
            <p className="text-xs text-pink-100 font-medium">
              Guest snapshot, unit search & resident authorization
            </p>
          </div>
        </button>

        {/* CARD 2: Quick Delivery Check-In */}
        <button
          type="button"
          onClick={() => {
            setPreSelectedUnit(null);
            setIsDeliveryModalOpen(true);
          }}
          className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl shadow-amber-500/20 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between text-left relative overflow-hidden group cursor-pointer border border-amber-300/30"
        >
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold group-hover:rotate-6 transition-transform">
              <Package className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-mono font-bold bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-amber-100 border border-white/20">
              KEY [2] / [D]
            </span>
          </div>

          <div className="space-y-1 mt-6">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              Delivery Check-In
            </h2>
            <p className="text-xs text-amber-100 font-medium">
              Blinkit, Zepto, Swiggy & automatic gate rules
            </p>
          </div>
        </button>

        {/* CARD 3: Verify Passcode / QR */}
        <button
          type="button"
          onClick={() => setIsPasscodeModalOpen(true)}
          className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-sky-600 to-blue-700 text-white shadow-xl shadow-sky-600/20 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between text-left relative overflow-hidden group cursor-pointer border border-sky-400/30"
        >
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold group-hover:rotate-6 transition-transform">
              <KeyRound className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-mono font-bold bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-sky-100 border border-white/20">
              KEY [3] / [P]
            </span>
          </div>

          <div className="space-y-1 mt-6">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              Verify Passcode
            </h2>
            <p className="text-xs text-sky-100 font-medium">
              6-Digit Keypad PIN or scanned QR guest token
            </p>
          </div>
        </button>

        {/* CARD 4: Mark Visitor / Staff Exit */}
        <button
          type="button"
          onClick={() => setIsExitModalOpen(true)}
          className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-gray-800 to-gray-950 text-white shadow-xl shadow-gray-950/30 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between text-left relative overflow-hidden group cursor-pointer border border-gray-700"
        >
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white font-bold group-hover:rotate-6 transition-transform">
              <LogOut className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-mono font-bold bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-full text-gray-300 border border-white/10">
              KEY [4] / [E]
            </span>
          </div>

          <div className="space-y-1 mt-6">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              Mark Exit / Out
            </h2>
            <p className="text-xs text-gray-400 font-medium">
              Checkout active visitors, couriers, or helpers
            </p>
          </div>
        </button>
      </section>

      {/* 3. Instant Resident & Unit Directory Quick-Search Bar */}
      <section aria-label="Instant Directory Search" className="card-static p-4 sm:p-5 border border-gray-800 bg-gray-900/90 text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#cd0447]/20 text-pink-400 flex items-center justify-center font-bold">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Instant Directory Quick-Search</h3>
              <p className="text-xs text-gray-400">Search flat number or resident name for 1-tap check-in</p>
            </div>
          </div>

          <span className="text-[11px] font-mono text-gray-400 hidden sm:inline">
            Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-200 border border-gray-700">/</kbd> to search
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={directoryQuery}
            onChange={(e) => setDirectoryQuery(e.target.value)}
            placeholder="Type flat number (e.g. 402, B-101) or resident name/phone..."
            className="w-full pl-12 pr-10 py-3.5 rounded-2xl bg-gray-950 border border-gray-700 focus:border-[#cd0447] text-white placeholder-gray-500 text-sm font-medium outline-none transition-colors"
          />
          {directoryQuery && (
            <button
              type="button"
              onClick={() => setDirectoryQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Directory Results Grid */}
        {isSearchingDirectory ? (
          <div className="py-6 text-center text-gray-400 space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#cd0447]" />
            <p className="text-xs">Searching society directory...</p>
          </div>
        ) : directoryItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {directoryItems.map((unit) => (
              <div
                key={unit.unitId}
                className="p-4 rounded-2xl bg-gray-950 border border-gray-800 hover:border-gray-700 flex flex-col justify-between gap-3 transition-all"
              >
                {/* Unit Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 font-black text-sm flex items-center justify-center shrink-0">
                      {unit.unitNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-white text-sm truncate">
                        Flat {unit.unitNumber}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {unit.buildingName || societyName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Residents List with Phone Dial Links */}
                <div className="space-y-1.5 text-xs">
                  {unit.residents && unit.residents.length > 0 ? (
                    unit.residents.map((res) => (
                      <div
                        key={res.id}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-gray-900/60 border border-gray-800/80"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-gray-200 block truncate">
                            {res.name}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {res.role || 'Resident'}
                          </span>
                        </div>

                        {res.phone && (
                          <a
                            href={`tel:${res.phone}`}
                            className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-800 shrink-0 flex items-center gap-1 text-[11px] font-mono font-bold transition-colors"
                            title={`Call ${res.name}`}
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 italic text-[11px]">No resident profile listed</div>
                  )}
                </div>

                {/* 1-Tap Entry Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-800/80">
                  <button
                    type="button"
                    onClick={() => handleStartVisitorForUnit(unit)}
                    className="py-2 px-2.5 rounded-xl bg-[#cd0447] hover:bg-[#b0033d] text-white text-xs font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Log Visitor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartDeliveryForUnit(unit)}
                    className="py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Delivery</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : directoryQuery.trim() ? (
          <div className="py-4 text-center text-xs text-gray-400">
            No flats matching "{directoryQuery}" found in society directory.
          </div>
        ) : null}
      </section>

      {/* 4. Real-Time Pending Queue (with 90s Countdown & Fallback Dial) */}
      <section aria-label="Real-Time Pending Approvals Queue" className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#cd0447]/10 text-[#cd0447] flex items-center justify-center font-bold">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <span>Real-Time Pending Authorization Queue</span>
                {pendingApprovals.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#cd0447] text-white animate-pulse">
                    {pendingApprovals.length} PENDING
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400">
                Awaiting resident 1-tap confirmation • 90-second automated timeout
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refetchPending(true)}
            disabled={isRefreshingPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPending ? 'animate-spin text-[#cd0447]' : ''}`} />
            <span>{isRefreshingPending ? 'Refreshing...' : 'Refresh Queue'}</span>
          </button>
        </div>

        {/* Pending Approvals Grid */}
        {isLoadingPending ? (
          <div className="p-12 text-center text-gray-400 bg-gray-900/60 rounded-3xl border border-gray-800 space-y-2">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#cd0447]" />
            <p className="text-xs font-medium">Checking live gate approvals...</p>
          </div>
        ) : pendingApprovals.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-gray-900/50 border border-dashed border-gray-800 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-950/50 border border-emerald-800 text-emerald-400 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-200">No visitors currently waiting</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                New entry requests initiated from this kiosk will appear here with live countdowns.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pendingApprovals.map((approval) => {
              const secondsLeft = countdownTimers[approval.id] ?? TOTAL_COUNTDOWN_SECONDS;
              const isTimedOut = secondsLeft <= 0;
              const isUrgent = secondsLeft <= 20;

              const isDelivery = approval.subjectType === 'DELIVERY' || Boolean(approval.platform);
              const displayName =
                approval.visitorName ||
                (isDelivery ? `${approval.platform || 'Courier'} Partner` : 'Guest Visitor');

              const photoUrl = approval.entryEventId
                ? guardApi.getVisitorPhotoUrl(approval.entryEventId)
                : null;

              const progressPct = (secondsLeft / TOTAL_COUNTDOWN_SECONDS) * 100;

              return (
                <div
                  key={approval.id}
                  className={`p-5 rounded-3xl border-2 flex flex-col justify-between gap-4 transition-all relative overflow-hidden ${
                    isTimedOut
                      ? 'bg-rose-950/40 border-rose-800/80 shadow-lg shadow-rose-950/50'
                      : isUrgent
                      ? 'bg-amber-950/40 border-amber-700/80 shadow-lg'
                      : 'bg-gray-900 border-gray-800 shadow-xl'
                  }`}
                >
                  {/* Top Live Progress Strip */}
                  <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ease-linear ${
                        isTimedOut
                          ? 'bg-rose-500'
                          : isUrgent
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-[#cd0447] to-[#e91e63]'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {/* Header with Countdown Clock */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#cd0447] animate-ping" />
                      <span className="text-[11px] font-bold text-[#cd0447] uppercase tracking-wider">
                        Ringing Flat
                      </span>
                    </div>

                    {/* Countdown Pill */}
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                        isTimedOut
                          ? 'bg-rose-900/60 border-rose-700 text-rose-300 animate-pulse'
                          : isUrgent
                          ? 'bg-amber-900/60 border-amber-700 text-amber-300'
                          : 'bg-gray-950 border-gray-700 text-gray-200'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{secondsLeft}s left</span>
                    </div>
                  </div>

                  {/* Visitor Meta & Photo */}
                  <div className="flex items-start gap-4">
                    {/* Visitor Snapshot */}
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-gray-700 shrink-0 bg-gray-950 flex items-center justify-center">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={displayName}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : isDelivery ? (
                        <Truck className="w-8 h-8 text-amber-400" />
                      ) : (
                        <UserIcon className="w-8 h-8 text-pink-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-base text-white truncate">
                          {displayName}
                        </h4>
                      </div>

                      {approval.platform && (
                        <span className="inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300">
                          {approval.platform}
                        </span>
                      )}

                      <div className="text-xs text-gray-400 flex items-center gap-1 pt-0.5">
                        <Building className="w-3.5 h-3.5 text-gray-500" />
                        <span className="font-bold text-gray-200">
                          Flat {approval.unitNumber || 'Target Unit'}
                        </span>
                      </div>

                      {approval.visitorPhone && (
                        <div className="text-xs font-mono text-gray-400 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-gray-500" />
                          <span>{approval.visitorPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fallback Call Resident Dial Button */}
                  <div className="pt-2 border-t border-gray-800/80">
                    {isTimedOut ? (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Resident Not Answering (90s Expired)</span>
                        </div>

                        {approval.visitorPhone ? (
                          <a
                            href={`tel:${approval.visitorPhone}`}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
                          >
                            <PhoneCall className="w-4 h-4" />
                            <span>Call Resident Phone Directly</span>
                          </a>
                        ) : (
                          <div className="text-[11px] text-gray-400">
                            Please use intercom or hold visitor at gate desk.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Status: Waiting for tap...</span>
                        {approval.visitorPhone && (
                          <a
                            href={`tel:${approval.visitorPhone}`}
                            className="text-emerald-400 hover:underline flex items-center gap-1 font-bold font-mono"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Modals */}
      <VisitorEntryModal
        isOpen={isVisitorModalOpen}
        onClose={() => setIsVisitorModalOpen(false)}
        gateId={gateId}
        initialUnitId={preSelectedUnit?.unitId}
        initialUnitNumber={preSelectedUnit?.unitNumber}
        onSuccess={() => void refetchPending(true)}
      />

      <DeliveryModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        gateId={gateId}
        initialUnitId={preSelectedUnit?.unitId}
        initialUnitNumber={preSelectedUnit?.unitNumber}
        onSuccess={() => void refetchPending(true)}
      />

      <PasscodeModal
        isOpen={isPasscodeModalOpen}
        onClose={() => setIsPasscodeModalOpen(false)}
        gateId={gateId}
        onSuccess={() => void refetchPending(true)}
      />

      <ExitModal
        isOpen={isExitModalOpen}
        onClose={() => setIsExitModalOpen(false)}
        gateId={gateId}
        onSuccess={() => void refetchPending(true)}
      />
    </div>
  );
};

export default KioskPage;
