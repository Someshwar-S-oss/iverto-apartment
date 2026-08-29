import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Building,
  User as UserIcon,
  Truck,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { playAllowChime, playDenyChime } from '../../components/real-time/SoundEffects';

export interface DecisionData {
  status: 'APPROVED' | 'AUTO_APPROVED' | 'REJECTED' | 'DENIED' | 'EXPIRED' | string;
  visitorName?: string;
  visitorPhone?: string;
  unitNumber?: string;
  buildingName?: string;
  mode?: string;
  platform?: string;
  subjectType?: string;
  photoUrl?: string | null;
  timestamp?: string;
  reason?: string;
}

export interface DecisionOverlayProps {
  decision: DecisionData | null;
  onDismiss: () => void;
  autoDismissSeconds?: number;
}

export const DecisionOverlay: React.FC<DecisionOverlayProps> = ({
  decision,
  onDismiss,
  autoDismissSeconds = 6,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(autoDismissSeconds);

  const isApproved =
    decision?.status === 'APPROVED' ||
    decision?.status === 'AUTO_APPROVED' ||
    decision?.mode === 'ALLOW_TO_DOOR' ||
    decision?.mode === 'LEAVE_AT_GATE';

  useEffect(() => {
    if (!decision) return;

    // Reset countdown
    setSecondsRemaining(autoDismissSeconds);

    // Play appropriate audio chime
    if (isApproved) {
      playAllowChime();
    } else {
      playDenyChime();
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [decision, isApproved, autoDismissSeconds, onDismiss]);

  if (!decision) return null;

  const isLeaveAtGate = decision.mode === 'LEAVE_AT_GATE';
  const isAllowToDoor = decision.mode === 'ALLOW_TO_DOOR';
  const isDelivery = Boolean(decision.platform) || decision.subjectType === 'DELIVERY';

  const progressPercent = (secondsRemaining / autoDismissSeconds) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-between p-6 sm:p-10 animate-scale-in select-none"
      style={{
        backgroundColor: isApproved
          ? isLeaveAtGate
            ? '#78350f' // Amber dark
            : '#064e3b' // Emerald deep dark
          : '#881337', // Rose deep dark
      }}
    >
      {/* Top Banner Progress Bar */}
      <div className="w-full bg-white/20 h-2.5 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-white transition-all duration-1000 ease-linear rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Top Info Strip */}
      <div className="flex items-center justify-between text-white/80 text-sm font-semibold shrink-0 pt-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Auto-closing in {secondsRemaining}s</span>
        </div>
        <div className="text-xs uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full border border-white/20">
          Guard Gate Verification Alert
        </div>
      </div>

      {/* Main Core Center Announcement */}
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto w-full my-auto space-y-6">
        {/* Giant Status Icon */}
        <div
          className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center text-white shadow-2xl border-4 ${
            isApproved
              ? isLeaveAtGate
                ? 'bg-amber-500 border-amber-300 shadow-amber-500/50 pulse-green'
                : 'bg-emerald-500 border-emerald-300 shadow-emerald-500/50 pulse-green'
              : 'bg-rose-600 border-rose-400 shadow-rose-600/50 animate-shake'
          }`}
        >
          {isApproved ? (
            isLeaveAtGate ? (
              <Truck className="w-16 h-16 sm:w-20 sm:h-20" />
            ) : (
              <CheckCircle2 className="w-20 h-20 sm:w-24 sm:h-24 stroke-[2.5]" />
            )
          ) : (
            <XCircle className="w-20 h-20 sm:w-24 sm:h-24 stroke-[2.5]" />
          )}
        </div>

        {/* Primary Verdict Headline */}
        <div className="space-y-2">
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white uppercase drop-shadow-md">
            {isApproved
              ? isLeaveAtGate
                ? 'LEAVE AT GATE'
                : isAllowToDoor
                ? 'ALLOW TO DOOR'
                : 'ALLOW ENTRY'
              : decision.status === 'EXPIRED'
              ? 'REQUEST EXPIRED'
              : 'DO NOT ADMIT'}
          </h1>
          <p className="text-lg sm:text-2xl font-bold text-white/90">
            {isApproved
              ? isLeaveAtGate
                ? 'Collect parcel at security desk — Resident requested drop-off at gate'
                : 'Resident authorized entry — Open the boom barrier'
              : decision.reason ||
                (decision.status === 'EXPIRED'
                  ? 'No response from resident in 90 seconds. Please call flat or hold visitor.'
                  : 'Resident actively rejected visitor entry request.')}
          </p>
        </div>

        {/* Target Details Card */}
        <div className="w-full max-w-2xl bg-white/10 backdrop-blur-xl border border-white/25 rounded-3xl p-5 sm:p-7 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
          {/* Visitor Snapshot if available */}
          {decision.photoUrl && (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/60 shadow-lg shrink-0 bg-black/40">
              <img
                src={decision.photoUrl}
                alt="Visitor"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Visitor Details */}
          <div className="flex-1 text-center sm:text-left space-y-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              {isDelivery ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-400 text-gray-950 text-xs font-black uppercase tracking-wider">
                  <Truck className="w-3.5 h-3.5" />
                  {decision.platform || 'Delivery'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider">
                  <UserIcon className="w-3.5 h-3.5" />
                  {decision.subjectType || 'Visitor'}
                </span>
              )}

              {decision.status === 'AUTO_APPROVED' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-400/30 border border-emerald-300 text-emerald-200 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Rule Applied
                </span>
              )}
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-white truncate">
              {decision.visitorName || (isDelivery ? `${decision.platform || 'Courier'} Partner` : 'Guest Visitor')}
            </div>

            {decision.visitorPhone && (
              <div className="text-sm font-mono text-white/80">
                Phone: {decision.visitorPhone}
              </div>
            )}
          </div>

          {/* Destination Flat Badge */}
          {decision.unitNumber && (
            <div className="bg-white/20 border border-white/40 rounded-2xl p-3 sm:p-4 text-center shrink-0 min-w-[130px]">
              <div className="text-[10px] uppercase font-bold text-white/80 tracking-wider flex items-center justify-center gap-1">
                <Building className="w-3 h-3" />
                Target Flat
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white">
                {decision.unitNumber}
              </div>
              {decision.buildingName && (
                <div className="text-xs text-white/70 truncate">{decision.buildingName}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Dismiss Action */}
      <div className="flex items-center justify-center shrink-0 pt-4">
        <button
          type="button"
          onClick={onDismiss}
          className="px-8 py-4 rounded-2xl bg-white hover:bg-gray-100 text-gray-900 font-extrabold text-base sm:text-lg shadow-2xl active:scale-95 transition-all flex items-center gap-3 cursor-pointer"
        >
          <span>Return to Guard Console</span>
          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded-md font-mono hidden sm:inline">
            [ESC / SPACE]
          </span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default DecisionOverlay;
