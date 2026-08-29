import React, { useState, useEffect, useCallback, useTransition } from 'react';
import {
  User as UserIcon,
  Phone,
  Building,
  Camera,
  CheckCircle2,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { guardApi, CreateGuardEntryPayload, CreateGuardEntryResponse } from '../../api/guard.api';
import type { UnitDirectoryItem } from '../../api/types';
import { Modal } from '../../components/ui/Modal';
import { WebcamCapture } from '../../components/ui/WebcamCapture';
import { useToast } from '../../context/ToastContext';

export interface VisitorEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gateId: string;
  initialUnitId?: string;
  initialUnitNumber?: string;
  onSuccess?: (res: CreateGuardEntryResponse) => void;
}

export const VisitorEntryModal: React.FC<VisitorEntryModalProps> = ({
  isOpen,
  onClose,
  gateId,
  initialUnitId,
  initialUnitNumber,
  onSuccess,
}) => {
  const toast = useToast();
  const [, startTransition] = useTransition();

  // Selected Unit State
  const [selectedUnit, setSelectedUnit] = useState<{
    unitId: string;
    unitNumber: string;
    buildingName?: string;
  } | null>(null);

  // Directory Search State
  const [unitSearchQuery, setUnitSearchQuery] = useState<string>('');
  const [directoryResults, setDirectoryResults] = useState<UnitDirectoryItem[]>([]);
  const [isSearchingDirectory, setIsSearchingDirectory] = useState<boolean>(false);

  // Visitor Form Fields
  const [visitorName, setVisitorName] = useState<string>('');
  const [visitorPhone, setVisitorPhone] = useState<string>('');
  const [capturedPhotoBase64, setCapturedPhotoBase64] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync initial unit when opened
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
      setUnitSearchQuery('');
      setVisitorName('');
      setVisitorPhone('');
      setCapturedPhotoBase64(null);
      setErrorMsg(null);
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

  // Handle Photo Capture
  const handlePhotoCapture = (dataUrl: string) => {
    setCapturedPhotoBase64(dataUrl);
    setErrorMsg(null);
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedUnit) {
      setErrorMsg('Please select a destination flat/unit.');
      return;
    }
    if (!visitorName.trim()) {
      setErrorMsg('Please enter visitor name.');
      return;
    }
    if (!capturedPhotoBase64) {
      setErrorMsg('Mandatory visitor photo capture is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateGuardEntryPayload = {
        unitId: selectedUnit.unitId,
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.trim() || undefined,
        subjectType: 'VISITOR',
        photoBase64: capturedPhotoBase64,
        mimeType: 'image/jpeg',
      };

      const res = await guardApi.createEntry(gateId, payload);
      toast.success(`Entry logged for visitor ${visitorName.trim()} to Flat ${selectedUnit.unitNumber}`);

      if (onSuccess) {
        onSuccess(res);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to log visitor entry:', err);
      const serverMessage = err.response?.data?.message || 'Failed to register visitor entry.';
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
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#cd0447] to-[#e91e63] text-white flex items-center justify-center font-bold shadow-md shadow-pink-500/20">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-gray-900 text-lg sm:text-xl">
              Log Visitor Entry
            </div>
            <div className="text-xs text-gray-500 font-normal">
              Capture visitor snapshot and dispatch instant authorization to resident
            </div>
          </div>
        </div>
      }
      size="lg"
      className="border-2 border-pink-100"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2.5 text-xs font-semibold animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: Flat / Unit Destination Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Building className="w-4 h-4 text-[#cd0447]" />
            <span>1. Destination Flat / Unit *</span>
          </label>

          {selectedUnit ? (
            /* Selected Unit Banner */
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-pink-50/80 border-2 border-pink-200 text-gray-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#cd0447] text-white flex items-center justify-center font-black text-sm shadow-sm">
                  {selectedUnit.unitNumber}
                </div>
                <div>
                  <div className="font-bold text-sm text-gray-900">
                    Flat {selectedUnit.unitNumber}
                  </div>
                  <div className="text-xs text-gray-500">
                    {selectedUnit.buildingName || 'Destination Unit'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUnit(null)}
                className="btn-secondary !text-xs !py-1 !px-3 text-gray-600 hover:text-rose-600"
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
                  placeholder="Type flat number (e.g. 402, B-101) or resident name..."
                  className="input-base !pl-10 w-full text-sm font-medium"
                  autoFocus
                />
                {isSearchingDirectory && (
                  <RefreshCw className="w-4 h-4 text-[#cd0447] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>

              {/* Directory Results Dropdown List */}
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
                      className="w-full p-3 text-left hover:bg-pink-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 group-hover:bg-[#cd0447] group-hover:text-white font-bold text-xs flex items-center justify-center transition-colors">
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
                      <span className="text-xs font-bold text-[#cd0447] group-hover:translate-x-1 transition-transform">
                        Select →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 2: Visitor Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-[#cd0447]" />
              <span>2. Visitor Full Name *</span>
            </label>
            <input
              type="text"
              required
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="input-base w-full text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              <span>Contact Phone (Optional)</span>
            </label>
            <input
              type="tel"
              value={visitorPhone}
              onChange={(e) => setVisitorPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="input-base w-full text-sm font-mono"
            />
          </div>
        </div>

        {/* STEP 3: Mandatory Camera Capture */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#cd0447]" />
              <span>3. Mandatory Visitor Photo Capture *</span>
            </label>
            {capturedPhotoBase64 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Snapshot Ready
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-rose-500">
                Photo Required
              </span>
            )}
          </div>

          <div className="p-3 bg-gray-950 rounded-3xl border border-gray-800 shadow-inner">
            <WebcamCapture onCapture={handlePhotoCapture} />
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
            disabled={isSubmitting || !selectedUnit || !visitorName.trim() || !capturedPhotoBase64}
            className="btn-primary flex-1 !py-3.5 font-bold text-base shadow-lg shadow-pink-600/30 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Submitting & Ringing Flat...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Submit Entry & Ring Resident</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default VisitorEntryModal;
