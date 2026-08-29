import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Truck,
  User as UserIcon,
  Sparkles,
  Building,
  Loader2,
  Clock,
} from 'lucide-react';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';
import residentApi from '../../api/resident.api';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { playAllowChime, playDenyChime } from './SoundEffects';

const TOTAL_COUNTDOWN_SECONDS = 90;

export const IncomingApprovalModal: React.FC = () => {
  const { incomingApproval, clearIncomingApproval } = useRealtime();
  const toast = useToast();

  const [timeLeft, setTimeLeft] = useState<number>(TOTAL_COUNTDOWN_SECONDS);
  const [isDeciding, setIsDeciding] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize and tick countdown timer
  useEffect(() => {
    if (!incomingApproval) {
      setTimeLeft(TOTAL_COUNTDOWN_SECONDS);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Calculate initial remaining seconds based on expiresAt if present
    if (incomingApproval.expiresAt) {
      const remaining = Math.max(
        0,
        Math.floor(
          (new Date(incomingApproval.expiresAt).getTime() - Date.now()) / 1000,
        ),
      );
      setTimeLeft(remaining > 0 ? Math.min(remaining, TOTAL_COUNTDOWN_SECONDS) : TOTAL_COUNTDOWN_SECONDS);
    } else {
      setTimeLeft(TOTAL_COUNTDOWN_SECONDS);
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          clearIncomingApproval();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [incomingApproval, clearIncomingApproval]);

  const handleDecision = useCallback(
    async (decision: 'APPROVED' | 'REJECTED') => {
      if (!incomingApproval || isDeciding) return;

      const { unitId, approvalId } = incomingApproval;
      setIsDeciding(true);

      try {
        if (decision === 'APPROVED') {
          playAllowChime();
        } else {
          playDenyChime();
        }

        if (unitId && approvalId) {
          await residentApi.decideApproval(unitId, approvalId, decision);
        }

        toast.success(
          decision === 'APPROVED'
            ? 'Entry approved. Gate opened.'
            : 'Entry rejected.',
        );
      } catch (err: any) {
        console.error('Failed to submit entry decision:', err);
        toast.error(
          err.response?.data?.message ||
            'Failed to communicate decision to the gate.',
        );
      } finally {
        setIsDeciding(false);
        clearIncomingApproval();
      }
    },
    [incomingApproval, isDeciding, clearIncomingApproval, toast],
  );

  if (!incomingApproval) return null;

  const isDelivery =
    incomingApproval.subjectType === 'DELIVERY' || Boolean(incomingApproval.platform);
  const isStaff = incomingApproval.subjectType === 'STAFF';

  // Progress percentage for circular/linear indicator
  const progressPercent = (timeLeft / TOTAL_COUNTDOWN_SECONDS) * 100;

  return (
    <Modal
      isOpen={Boolean(incomingApproval)}
      onClose={() => {
        // Dismiss alert locally
        clearIncomingApproval();
      }}
      size="md"
      hideCloseButton={isDeciding}
      className="border-2 border-[#cd0447]/30 shadow-2xl alert-pulse"
    >
      <div className="space-y-6">
        {/* Header with Title & Timer */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#cd0447]/10 text-[#cd0447] flex items-center justify-center font-bold">
              <ShieldCheck className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">
                Visitor Access Request
              </h2>
              <p className="text-xs text-gray-500">
                Gate personnel is requesting authorization
              </p>
            </div>
          </div>

          {/* Countdown Clock Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-mono transition-colors ${
              timeLeft <= 15
                ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse'
                : 'bg-gray-100 border-gray-200 text-gray-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{timeLeft}s</span>
          </div>
        </div>

        {/* Linear Countdown Progress Bar */}
        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden -mt-3">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 15 ? 'bg-rose-500' : 'bg-gradient-to-r from-[#cd0447] to-[#e91e63]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Visitor Card Details */}
        <div className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5 border border-white/60 bg-white/70">
          {/* Avatar / Photo */}
          <div className="relative shrink-0">
            {incomingApproval.photoUrl || incomingApproval.photoData ? (
              <img
                src={incomingApproval.photoUrl || incomingApproval.photoData}
                alt="Visitor snapshot"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-white shadow-md"
              />
            ) : isDelivery ? (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-600 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                <Truck className="w-10 h-10 mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {incomingApproval.platform || 'Delivery'}
                </span>
              </div>
            ) : isStaff ? (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-sky-50 border-2 border-sky-200 text-sky-600 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                <Sparkles className="w-10 h-10 mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Staff
                </span>
              </div>
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-pink-50 border-2 border-pink-200 text-[#cd0447] flex flex-col items-center justify-center p-2 text-center shadow-sm">
                <UserIcon className="w-10 h-10 mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Guest
                </span>
              </div>
            )}

            {/* Type badge overlay */}
            <div className="absolute -bottom-2 -right-2">
              <Badge
                variant={isDelivery ? 'warning' : isStaff ? 'info' : 'brand'}
                size="sm"
              >
                {incomingApproval.subjectType || (isDelivery ? 'Delivery' : 'Visitor')}
              </Badge>
            </div>
          </div>

          {/* Visitor Info Meta */}
          <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
            <div>
              <h3 className="text-xl font-bold text-gray-900 truncate">
                {incomingApproval.visitorName ||
                  (isDelivery
                    ? `${incomingApproval.platform || 'Courier'} Partner`
                    : 'Guest Visitor')}
              </h3>
              {incomingApproval.visitorPhone && (
                <p className="text-xs text-gray-500 font-mono">
                  {incomingApproval.visitorPhone}
                </p>
              )}
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              {incomingApproval.unitNumber && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700">
                  <Building className="w-3.5 h-3.5 text-gray-400" />
                  Unit {incomingApproval.unitNumber}
                </span>
              )}
              {incomingApproval.gateName && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600">
                  Gate: {incomingApproval.gateName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons: Giant Touch-Friendly APPROVE & REJECT */}
        <div className="grid grid-cols-2 gap-3.5 pt-2">
          {/* REJECT Button */}
          <button
            type="button"
            onClick={() => handleDecision('REJECTED')}
            disabled={isDeciding}
            className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-sm sm:text-base text-rose-700 bg-rose-50 hover:bg-rose-100 active:scale-[0.98] border-2 border-rose-200 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {isDeciding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            <span>REJECT</span>
          </button>

          {/* APPROVE Button */}
          <button
            type="button"
            onClick={() => handleDecision('APPROVED')}
            disabled={isDeciding}
            className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isDeciding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            <span>APPROVE</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default IncomingApprovalModal;
