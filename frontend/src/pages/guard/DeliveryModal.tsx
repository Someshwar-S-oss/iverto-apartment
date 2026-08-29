import React, { useState, useEffect, useCallback, useTransition } from 'react';
import {
  Truck,
  Building,
  CheckCircle2,
  AlertCircle,
  Search,
  Loader2,
  Camera,
  Check,
  DoorOpen,
  Package,
  Clock,
} from 'lucide-react';
import { guardApi, CreateGuardEntryPayload, CreateGuardEntryResponse } from '../../api/guard.api';
import type { DeliveryPlatform, UnitDirectoryItem } from '../../api/types';
import { Modal } from '../../components/ui/Modal';
import { WebcamCapture } from '../../components/ui/WebcamCapture';
import { useToast } from '../../context/ToastContext';

export interface DeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gateId: string;
  initialUnitId?: string;
  initialUnitNumber?: string;
  onSuccess?: (res: CreateGuardEntryResponse) => void;
}

interface PlatformOption {
  key: DeliveryPlatform;
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  badgeColor: string;
}

const PLATFORMS: PlatformOption[] = [
  {
    key: 'BLINKIT',
    label: 'Blinkit',
    bgColor: 'bg-yellow-50 hover:bg-yellow-100',
    textColor: 'text-yellow-900',
    borderColor: 'border-yellow-300',
    badgeColor: 'bg-yellow-400 text-yellow-950',
  },
  {
    key: 'ZEPTO',
    label: 'Zepto',
    bgColor: 'bg-purple-50 hover:bg-purple-100',
    textColor: 'text-purple-900',
    borderColor: 'border-purple-300',
    badgeColor: 'bg-purple-600 text-white',
  },
  {
    key: 'SWIGGY',
    label: 'Swiggy',
    bgColor: 'bg-orange-50 hover:bg-orange-100',
    textColor: 'text-orange-900',
    borderColor: 'border-orange-300',
    badgeColor: 'bg-orange-500 text-white',
  },
  {
    key: 'INSTAMART',
    label: 'Instamart',
    bgColor: 'bg-orange-50/70 hover:bg-orange-100',
    textColor: 'text-orange-950',
    borderColor: 'border-orange-300',
    badgeColor: 'bg-orange-600 text-white',
  },
  {
    key: 'AMAZON',
    label: 'Amazon',
    bgColor: 'bg-sky-50 hover:bg-sky-100',
    textColor: 'text-sky-900',
    borderColor: 'border-sky-300',
    badgeColor: 'bg-sky-500 text-white',
  },
  {
    key: 'FLIPKART',
    label: 'Flipkart',
    bgColor: 'bg-blue-50 hover:bg-blue-100',
    textColor: 'text-blue-900',
    borderColor: 'border-blue-300',
    badgeColor: 'bg-blue-600 text-white',
  },
  {
    key: 'OTHER',
    label: 'Other Courier',
    bgColor: 'bg-gray-100 hover:bg-gray-200',
    textColor: 'text-gray-900',
    borderColor: 'border-gray-300',
    badgeColor: 'bg-gray-700 text-white',
  },
];

export const DeliveryModal: React.FC<DeliveryModalProps> = ({
  isOpen,
  onClose,
  gateId,
  initialUnitId,
  initialUnitNumber,
  onSuccess,
}) => {
  const toast = useToast();
  const [, startTransition] = useTransition();

  // Selected Platform & Unit
  const [selectedPlatform, setSelectedPlatform] = useState<DeliveryPlatform>('BLINKIT');
  const [selectedUnit, setSelectedUnit] = useState<{
    unitId: string;
    unitNumber: string;
    buildingName?: string;
  } | null>(null);

  // Directory Search
  const [unitSearchQuery, setUnitSearchQuery] = useState<string>('');
  const [directoryResults, setDirectoryResults] = useState<UnitDirectoryItem[]>([]);
  const [isSearchingDirectory, setIsSearchingDirectory] = useState<boolean>(false);

  // Optional Agent / Courier Details
  const [agentName, setAgentName] = useState<string>('');
  const [agentPhone, setAgentPhone] = useState<string>('');
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [capturedPhotoBase64, setCapturedPhotoBase64] = useState<string | null>(null);

  // Submitting & Results State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decisionResult, setDecisionResult] = useState<{
    autoApproved?: boolean;
    mode?: string;
    message?: string;
  } | null>(null);

  // Reset or initialize on modal open
  useEffect(() => {
    if (isOpen) {
      if (initialUnitId && initialUnitNumber) {
        setSelectedUnit({
          unitId: initialUnitId,
          unitNumber: initialUnitNumber,
        });
      } else {
        setSelectedUnit(null);
      }
      setSelectedPlatform('BLINKIT');
      setUnitSearchQuery('');
      setAgentName('');
      setAgentPhone('');
      setCapturedPhotoBase64(null);
      setShowCamera(false);
      setErrorMsg(null);
      setDecisionResult(null);
    }
  }, [isOpen, initialUnitId, initialUnitNumber]);

  // Search Unit Directory with debounce
  const searchDirectory = useCallback(
    async (query: string) => {
      if (!gateId || !query.trim()) {
        setDirectoryResults([]);
        return;
      }
      setIsSearchingDirectory(true);
      try {
        const results = await guardApi.getDirectory(gateId, query.trim());
        startTransition(() => {
          setDirectoryResults(results || []);
        });
      } catch (err) {
        console.error('Failed to query directory:', err);
      } finally {
        setIsSearchingDirectory(false);
      }
    },
    [gateId],
  );

  useEffect(() => {
    if (!selectedUnit && unitSearchQuery.trim().length >= 1) {
      const handler = setTimeout(() => {
        searchDirectory(unitSearchQuery);
      }, 200);
      return () => clearTimeout(handler);
    } else {
      setDirectoryResults([]);
    }
  }, [unitSearchQuery, selectedUnit, searchDirectory]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedUnit) {
      setErrorMsg('Please select a destination unit/flat.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateGuardEntryPayload = {
        unitId: selectedUnit.unitId,
        visitorName: agentName.trim() || `${selectedPlatform} Partner`,
        visitorPhone: agentPhone.trim() || undefined,
        subjectType: 'DELIVERY',
        platform: selectedPlatform,
        photoBase64: capturedPhotoBase64 || undefined,
        mimeType: capturedPhotoBase64 ? 'image/jpeg' : undefined,
      };

      const res = await guardApi.createEntry(gateId, payload);

      const isAuto = res.autoApproved || (res as any).mode === 'ALLOW_TO_DOOR' || (res as any).mode === 'LEAVE_AT_GATE';
      const mode = (res as any).mode || (isAuto ? 'ALLOW_TO_DOOR' : 'PENDING');

      setDecisionResult({
        autoApproved: isAuto,
        mode,
        message: res.message,
      });

      toast.success(
        isAuto
          ? `Delivery auto-approved (${mode === 'LEAVE_AT_GATE' ? 'Leave at Gate' : 'Allow to Door'})`
          : `Approval request dispatched to Flat ${selectedUnit.unitNumber}`,
      );

      if (onSuccess) {
        onSuccess(res);
      }

      // Auto close after 2 seconds if auto-approved
      if (isAuto) {
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      console.error('Failed to log delivery check-in:', err);
      const serverMessage = err.response?.data?.message || 'Failed to check-in delivery.';
      setErrorMsg(serverMessage);
      toast.error(serverMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-gray-900 text-lg sm:text-xl">
              Quick Delivery Check-In
            </div>
            <div className="text-xs text-gray-500 font-normal">
              1-tap platform verification and automated flat access rule evaluation
            </div>
          </div>
        </div>
      }
      size="lg"
      className="border-2 border-amber-100"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2.5 text-xs font-semibold animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Result Feedback Banner if just submitted */}
        {decisionResult && (
          <div
            className={`p-4 rounded-2xl border-2 animate-scale-in text-center space-y-2 ${
              decisionResult.mode === 'ALLOW_TO_DOOR'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : decisionResult.mode === 'LEAVE_AT_GATE'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-pink-50 border-pink-300 text-pink-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2 font-black text-lg sm:text-xl">
              {decisionResult.mode === 'ALLOW_TO_DOOR' ? (
                <>
                  <DoorOpen className="w-6 h-6 text-emerald-600" />
                  <span>AUTO-APPROVED: ALLOW TO DOOR</span>
                </>
              ) : decisionResult.mode === 'LEAVE_AT_GATE' ? (
                <>
                  <Package className="w-6 h-6 text-amber-600" />
                  <span>AUTO-APPROVED: LEAVE AT GUARD DESK</span>
                </>
              ) : (
                <>
                  <Clock className="w-6 h-6 text-[#cd0447] animate-spin" />
                  <span>APPROVAL DISPATCHED (90s Countdown)</span>
                </>
              )}
            </div>
            <p className="text-xs font-semibold opacity-90">
              {decisionResult.mode === 'ALLOW_TO_DOOR'
                ? 'Resident rule allows courier to proceed directly to apartment.'
                : decisionResult.mode === 'LEAVE_AT_GATE'
                ? 'Resident rule requires holding the parcel at the gate security counter.'
                : 'Resident is being rung on their mobile app.'}
            </p>
          </div>
        )}

        {/* STEP 1: Delivery Platform Selection (Chips) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-amber-600" />
            <span>1. Select Delivery Company *</span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {PLATFORMS.map((p) => {
              const isSelected = selectedPlatform === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelectedPlatform(p.key)}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                    isSelected
                      ? `border-gray-900 bg-gray-900 text-white shadow-md scale-[1.02]`
                      : `${p.borderColor} ${p.bgColor} ${p.textColor}`
                  }`}
                >
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-white text-gray-900' : p.badgeColor
                    }`}
                  >
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Flat / Unit Destination Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Building className="w-4 h-4 text-amber-600" />
            <span>2. Destination Flat / Unit *</span>
          </label>

          {selectedUnit ? (
            /* Selected Unit Banner */
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/80 border-2 border-amber-200 text-gray-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shadow-sm">
                  {selectedUnit.unitNumber}
                </div>
                <div>
                  <div className="font-bold text-sm text-gray-900">
                    Flat {selectedUnit.unitNumber}
                  </div>
                  <div className="text-xs text-gray-500">
                    {selectedUnit.buildingName || 'Destination Flat'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUnit(null)}
                className="btn-secondary !text-xs !py-1 !px-3 text-gray-600 hover:text-amber-700"
              >
                Change Flat
              </button>
            </div>
          ) : (
            /* Unit Directory Search Box */
            <div className="relative space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={unitSearchQuery}
                  onChange={(e) => setUnitSearchQuery(e.target.value)}
                  placeholder="Type flat number (e.g. 402, A-102) to check rules..."
                  className="input-base !pl-10 w-full text-sm font-medium"
                />
                {isSearchingDirectory && (
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>

              {/* Directory Results Dropdown */}
              {directoryResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl divide-y divide-gray-100">
                  {directoryResults.map((item) => (
                    <button
                      key={item.unitId}
                      type="button"
                      onClick={() => {
                        setSelectedUnit({
                          unitId: item.unitId,
                          unitNumber: item.unitNumber,
                          buildingName: item.buildingName,
                        });
                        setDirectoryResults([]);
                      }}
                      className="w-full p-3 text-left hover:bg-amber-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 group-hover:bg-amber-500 group-hover:text-white font-bold text-xs flex items-center justify-center transition-colors">
                          {item.unitNumber}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">
                            Unit {item.unitNumber} {item.buildingName ? `• ${item.buildingName}` : ''}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.residents && item.residents.length > 0
                              ? item.residents.map((r) => r.name).join(', ')
                              : 'No residents listed'}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-600 group-hover:translate-x-1 transition-transform">
                        Select →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 3: Courier Partner Info (Optional) & Photo Snapshot */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Delivery Agent Name (Optional)
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={`e.g. ${selectedPlatform} Rider`}
                className="input-base w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Rider Phone / Vehicle (Optional)
              </label>
              <input
                type="text"
                value={agentPhone}
                onChange={(e) => setAgentPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210 or MH-02-1234"
                className="input-base w-full text-xs font-mono"
              />
            </div>
          </div>

          {/* Optional Snapshot Drawer */}
          <div>
            {!showCamera && !capturedPhotoBase64 ? (
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="btn-secondary !text-xs !py-2 flex items-center gap-2 w-full justify-center text-gray-600"
              >
                <Camera className="w-4 h-4 text-amber-600" />
                <span>Optional: Capture Courier / Parcel Photo</span>
              </button>
            ) : (
              <div className="p-3 bg-gray-950 rounded-2xl border border-gray-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-300 font-semibold px-1">
                  <span>Courier Snapshot</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCamera(false);
                      setCapturedPhotoBase64(null);
                    }}
                    className="text-rose-400 hover:text-rose-300 text-xs"
                  >
                    Hide Camera
                  </button>
                </div>
                <WebcamCapture
                  onCapture={(dataUrl) => {
                    setCapturedPhotoBase64(dataUrl);
                    setShowCamera(false);
                  }}
                />
              </div>
            )}

            {capturedPhotoBase64 && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Parcel / Rider Snapshot Attached</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCapturedPhotoBase64(null)}
                  className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting || !selectedUnit}
            className="btn-primary flex-1 !py-3.5 !bg-gradient-to-r !from-amber-500 !to-orange-500 hover:!from-amber-600 hover:!to-orange-600 font-bold text-base shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Checking Rules & Dispatching...</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>Check-In {selectedPlatform} Courier</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default DeliveryModal;
