import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  QrCode,
  CheckCircle2,
  XCircle,
  Delete,
  RotateCcw,
  Loader2,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { guardApi, VerifyPasscodeResponse } from '../../api/guard.api';
import { Modal } from '../../components/ui/Modal';
import { playAllowChime, playDenyChime } from '../../components/real-time/SoundEffects';
import { useToast } from '../../context/ToastContext';

export interface PasscodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  gateId: string;
  onSuccess?: (res: VerifyPasscodeResponse) => void;
}

export const PasscodeModal: React.FC<PasscodeModalProps> = ({
  isOpen,
  onClose,
  gateId,
  onSuccess,
}) => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'pin' | 'qr'>('pin');
  const [pinDigits, setPinDigits] = useState<string>('');
  const [qrInput, setQrInput] = useState<string>('');

  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    message?: string;
    unitNumber?: string;
    entryEventId?: string;
  } | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setPinDigits('');
      setQrInput('');
      setVerifyResult(null);
      setIsVerifying(false);
      setActiveTab('pin');
    }
  }, [isOpen]);

  // Execute Verification
  const executeVerification = useCallback(
    async (codeOrToken: string) => {
      if (!gateId || !codeOrToken.trim() || isVerifying) return;

      setIsVerifying(true);
      setVerifyResult(null);

      try {
        const res = await guardApi.verifyPasscode(gateId, {
          codeOrQrToken: codeOrToken.trim(),
        });

        if (res.valid) {
          playAllowChime();
          const unitNumber = res.entryEvent?.unitNumber || (res as any).unitId || 'Verified Flat';
          setVerifyResult({
            valid: true,
            message: res.message || 'Passcode successfully verified! Barrier opening.',
            unitNumber,
            entryEventId: res.entryEvent?.id,
          });
          toast.success(`Passcode verified! Access granted.`);

          if (onSuccess) {
            onSuccess(res);
          }

          // Auto-close on success after 2 seconds
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          playDenyChime();
          setVerifyResult({
            valid: false,
            message: res.message || 'Invalid passcode or expired usage limit.',
          });
          toast.error(res.message || 'Passcode rejected.');
        }
      } catch (err: any) {
        console.error('Failed to verify passcode:', err);
        playDenyChime();
        const msg =
          err.response?.data?.message ||
          'Passcode verification failed. Invalid, expired, or limit exceeded.';
        setVerifyResult({
          valid: false,
          message: msg,
        });
        toast.error(msg);
      } finally {
        setIsVerifying(false);
      }
    },
    [gateId, isVerifying, onSuccess, onClose, toast],
  );

  // Keypad button click
  const handleKeypadPress = (val: string) => {
    if (isVerifying || verifyResult?.valid) return;
    if (pinDigits.length < 6) {
      const next = pinDigits + val;
      setPinDigits(next);
      if (next.length === 6) {
        executeVerification(next);
      }
    }
  };

  const handleBackspace = () => {
    if (isVerifying || verifyResult?.valid) return;
    setPinDigits((prev) => prev.slice(0, -1));
    setVerifyResult(null);
  };

  const handleClear = () => {
    if (isVerifying || verifyResult?.valid) return;
    setPinDigits('');
    setVerifyResult(null);
  };

  // Listen for physical keyboard strokes when modal is active in PIN mode
  useEffect(() => {
    if (!isOpen || activeTab !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user presses digits 0-9
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (pinDigits.length >= 4) {
          executeVerification(pinDigits);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, pinDigits, isVerifying, verifyResult, executeVerification, onClose]);

  // QR Form submit
  const handleQrSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qrInput.trim()) {
      executeVerification(qrInput.trim());
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-bold shadow-md shadow-sky-600/20">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-gray-900 text-lg sm:text-xl">
              Verify Passcode / QR Pass
            </div>
            <div className="text-xs text-gray-500 font-normal">
              Validate 6-digit visitor OTPs, delivery tokens, or resident digital passes
            </div>
          </div>
        </div>
      }
      size="md"
      className="border-2 border-sky-100"
    >
      <div className="space-y-5">
        {/* Tab Switcher: Numeric Keypad vs QR Scanner */}
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('pin');
              setVerifyResult(null);
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'pin'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <KeyRound className="w-4 h-4 text-sky-600" />
            <span>Numeric Keypad PIN</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('qr');
              setVerifyResult(null);
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <QrCode className="w-4 h-4 text-sky-600" />
            <span>Scan QR / Token</span>
          </button>
        </div>

        {/* Verification Result Feedback Overlay */}
        {verifyResult && (
          <div
            className={`p-4 rounded-2xl border-2 flex items-center gap-3 animate-scale-in ${
              verifyResult.valid
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                verifyResult.valid
                  ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                  : 'bg-rose-500 text-white shadow-rose-500/30'
              }`}
            >
              {verifyResult.valid ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <XCircle className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-sm sm:text-base">
                {verifyResult.valid ? 'PASSCODE VALID — ALLOW ENTRY' : 'PASSCODE REJECTED'}
              </div>
              <div className="text-xs opacity-90 truncate">
                {verifyResult.message}
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: Numeric PIN Keypad */}
        {activeTab === 'pin' && (
          <div className="space-y-4">
            {/* 6-Digit Display Boxes */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 py-3">
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const digit = pinDigits[index];
                const isCurrent = index === pinDigits.length;
                return (
                  <div
                    key={index}
                    className={`w-11 h-14 sm:w-13 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black font-mono border-2 transition-all select-none ${
                      digit
                        ? 'border-sky-500 bg-sky-50/50 text-gray-900 shadow-xs'
                        : isCurrent
                        ? 'border-[#cd0447] bg-white ring-2 ring-[#cd0447]/20 text-transparent animate-pulse'
                        : 'border-gray-200 bg-gray-50/50 text-gray-300'
                    }`}
                  >
                    {digit || '•'}
                  </div>
                );
              })}
            </div>

            {/* Giant Touch Keypad Grid */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 max-w-xs mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeypadPress(digit)}
                  disabled={isVerifying}
                  className="h-14 sm:h-16 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 text-xl sm:text-2xl font-black text-gray-900 shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
                >
                  {digit}
                </button>
              ))}

              {/* Clear Button */}
              <button
                type="button"
                onClick={handleClear}
                disabled={isVerifying || pinDigits.length === 0}
                className="h-14 sm:h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Clear</span>
              </button>

              {/* Zero */}
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                disabled={isVerifying}
                className="h-14 sm:h-16 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 text-xl sm:text-2xl font-black text-gray-900 shadow-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
              >
                0
              </button>

              {/* Backspace Button */}
              <button
                type="button"
                onClick={handleBackspace}
                disabled={isVerifying || pinDigits.length === 0}
                className="h-14 sm:h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer disabled:opacity-40"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

            {/* Manual Verify Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => executeVerification(pinDigits)}
                disabled={isVerifying || pinDigits.length < 4}
                className="btn-primary w-full !py-3.5 !bg-sky-600 hover:!bg-sky-700 font-bold text-base shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying with Gate Server...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 stroke-[2.5]" />
                    <span>Verify Passcode PIN</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: QR Token / Scanner Mode */}
        {activeTab === 'qr' && (
          <form onSubmit={handleQrSubmit} className="space-y-4">
            <div className="p-6 rounded-3xl bg-gray-950 text-white text-center space-y-4 border border-gray-800">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                <QrCode className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">QR Code / Digital Pass Token</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Scan barcode with kiosk hardware reader or paste UUID token below
                </p>
              </div>

              <div>
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Paste QR UUID Token (e.g. 550e8400-e29b-41d4-...)"
                  className="input-base !bg-gray-900 !border-gray-700 !text-white text-xs font-mono text-center w-full"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying || !qrInput.trim()}
              className="btn-primary w-full !py-3.5 !bg-sky-600 hover:!bg-sky-700 font-bold text-base shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verifying QR Pass...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Verify Scanned QR Pass</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PasscodeModal;
