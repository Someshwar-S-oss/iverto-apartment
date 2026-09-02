import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Clock,
  Trash2,
  Share2,
} from 'lucide-react';
import { residentApi, CreatePasscodePayload } from '../../api/resident.api';
import type { Passcode } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const PASSCODES_KEY = (unitId: string) => `resident/passcodes|unit:${unitId}`;

export const PasscodesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'Flat';
  const societyName = activeContext?.societyName || 'Society';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'REVOKED'>('ALL');

  // Generate Passcode Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState<boolean>(false);
  const [durationPreset, setDurationPreset] = useState<'6h' | '12h' | '24h' | 'weekend' | 'custom'>('12h');
  const [customValidUntil, setCustomValidUntil] = useState<string>(() => {
    const d = new Date(Date.now() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [maxUses, setMaxUses] = useState<number>(1);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Digital Pass Share Modal
  const [selectedPassToShare, setSelectedPassToShare] = useState<Passcode | null>(null);
  const [hasCopied, setHasCopied] = useState<boolean>(false);

  // Revoke Passcode Dialog
  const [passcodeToRevoke, setPasscodeToRevoke] = useState<Passcode | null>(null);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  // Handle URL param ?action=generate
  useEffect(() => {
    if (searchParams.get('action') === 'generate') {
      setIsGenerateModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const passcodesKey = useMemo(() => PASSCODES_KEY(unitId || 'none'), [unitId]);

  const {
    data: passcodesData,
    isLoading,
    isRefreshing,
    refetch,
  } = useCachedFetch<Passcode[]>(
    passcodesKey,
    () => residentApi.listPasscodes(unitId).then((data) => data || []),
    { deps: [unitId], skipInitialFetch: !unitId },
  );

  const passcodes = useMemo(() => passcodesData ?? [], [passcodesData]);

  // Quick Preset Change
  const handlePresetChange = (preset: '6h' | '12h' | '24h' | 'weekend' | 'custom') => {
    setDurationPreset(preset);
    const now = Date.now();
    let targetTime = now + 12 * 3600 * 1000;

    if (preset === '6h') targetTime = now + 6 * 3600 * 1000;
    else if (preset === '12h') targetTime = now + 12 * 3600 * 1000;
    else if (preset === '24h') targetTime = now + 24 * 3600 * 1000;
    else if (preset === 'weekend') targetTime = now + 72 * 3600 * 1000;

    setCustomValidUntil(new Date(targetTime).toISOString().slice(0, 16));
  };

  // Generate Passcode Submit
  const handleCreatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId) return;

    setIsCreating(true);
    try {
      const validUntilDate = new Date(customValidUntil).toISOString();
      const payload: CreatePasscodePayload = {
        validUntil: validUntilDate,
        maxUses: Number(maxUses) || 1,
      };

      const created = await residentApi.createPasscode(unitId, payload);
      toastSuccess(`6-Digit Guest Passcode generated: ${created.code}`);

      setIsGenerateModalOpen(false);
      setSelectedPassToShare(created);
      await refetch(true);
    } catch (err: any) {
      console.error('Failed to create passcode:', err);
      toastError(err.response?.data?.message || 'Failed to generate passcode.');
    } finally {
      setIsCreating(false);
    }
  };

  // Revoke Passcode Submit
  const handleRevokePasscode = async () => {
    if (!unitId || !passcodeToRevoke) return;

    setIsRevoking(true);
    try {
      await residentApi.revokePasscode(unitId, passcodeToRevoke.id);
      toastSuccess(`Passcode ${passcodeToRevoke.code} revoked.`);
      setPasscodeToRevoke(null);
      await refetch(true);
    } catch (err: any) {
      console.error('Failed to revoke passcode:', err);
      toastError(err.response?.data?.message || 'Failed to revoke passcode.');
    } finally {
      setIsRevoking(false);
    }
  };

  // Copy Digital Pass Text to Clipboard
  const handleCopyPassMessage = (pass: Passcode) => {
    const validUntilFormatted = new Date(pass.validUntil).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const shareText = `*Gate Access Pass — ${societyName}*\n\n` +
      `Unit: *${unitNumber}*\n` +
      `PIN Code: *${pass.code}*\n` +
      `Valid Until: ${validUntilFormatted}\n` +
      `Max Uses: ${pass.maxUses}\n\n` +
      `_Please enter this 6-digit PIN on the security kiosk keypad or show this pass at the gate for automatic entry._`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setHasCopied(true);
      toastSuccess('Passcode invitation copied to clipboard!');
      setTimeout(() => setHasCopied(false), 2500);
    }
  };

  // Filtered passcodes
  const filteredPasscodes = useMemo(() => {
    const now = Date.now();
    return passcodes.filter((p) => {
      const isExpired = new Date(p.validUntil).getTime() <= now;
      const isRevoked = p.revoked;
      const isActive = !isRevoked && !isExpired && p.usesCount < p.maxUses;

      if (filterStatus === 'ACTIVE' && !isActive) return false;
      if (filterStatus === 'EXPIRED' && (!isExpired || isRevoked)) return false;
      if (filterStatus === 'REVOKED' && !isRevoked) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return p.code.includes(q);
    });
  }, [passcodes, filterStatus, searchQuery]);

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Guest Passcodes & OTPs"
        subtitle={`Generate 6-digit PINs and QR passes for visitors, delivery couriers, or temporary service contractors at Flat ${unitNumber}`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => void refetch(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh passcodes"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsGenerateModalOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Generate Guest Pass</span>
            </button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by 6-digit PIN code..."
            className="w-full font-mono"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`btn-secondary !text-xs !py-1.5 !px-3 ${
              filterStatus === 'ALL' ? '!bg-gray-900 !text-white !border-gray-900' : ''
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('ACTIVE')}
            className={`btn-secondary !text-xs !py-1.5 !px-3 ${
              filterStatus === 'ACTIVE' ? '!bg-emerald-600 !text-white !border-emerald-600' : ''
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('EXPIRED')}
            className={`btn-secondary !text-xs !py-1.5 !px-3 ${
              filterStatus === 'EXPIRED' ? '!bg-gray-700 !text-white !border-gray-700' : ''
            }`}
          >
            Expired
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('REVOKED')}
            className={`btn-secondary !text-xs !py-1.5 !px-3 ${
              filterStatus === 'REVOKED' ? '!bg-rose-600 !text-white !border-rose-600' : ''
            }`}
          >
            Revoked
          </button>
        </div>
      </div>

      {/* Passcodes Grid / Table */}
      <div className="space-y-4">
        {isLoading ? (
          <TableSkeleton columns={4} rows={3} />
        ) : passcodes.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No guest passcodes generated yet"
            description="Create a 6-digit PIN code or QR pass to grant pre-authorized entry for your guests."
            action={
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(true)}
                className="btn-primary text-xs"
              >
                Generate Guest Pass
              </button>
            }
          />
        ) : filteredPasscodes.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setFilterStatus('ALL');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPasscodes.map((pass) => {
              const now = Date.now();
              const isExpired = new Date(pass.validUntil).getTime() <= now;
              const isRevoked = pass.revoked;
              const isExhausted = pass.usesCount >= pass.maxUses;
              const isActive = !isRevoked && !isExpired && !isExhausted;

              return (
                <div
                  key={pass.id}
                  className={`card p-5 border-2 transition-all flex flex-col justify-between gap-5 relative overflow-hidden ${
                    isActive
                      ? 'border-pink-200/90 bg-gradient-to-b from-white to-pink-50/20 shadow-sm'
                      : 'border-gray-200 bg-gray-50/60 opacity-80'
                  }`}
                >
                  {/* Top Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-[#cd0447]" />
                      <span>Guest PIN</span>
                    </span>

                    <Badge
                      variant={
                        isActive ? 'success' : isRevoked ? 'danger' : 'neutral'
                      }
                      size="sm"
                      dot={isActive}
                    >
                      {isActive
                        ? 'ACTIVE'
                        : isRevoked
                        ? 'REVOKED'
                        : isExhausted
                        ? 'USED'
                        : 'EXPIRED'}
                    </Badge>
                  </div>

                  {/* Giant 6-Digit PIN Display */}
                  <div className="text-center py-2 bg-white/80 rounded-2xl border border-gray-100 shadow-xs">
                    <div className="text-4xl font-black font-mono tracking-widest text-gray-900 select-all">
                      {pass.code}
                    </div>
                    <div className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase mt-1">
                      Keypad Verification Code
                    </div>
                  </div>

                  {/* Meta Details */}
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        Valid Until
                      </span>
                      <span className="font-semibold text-gray-800">
                        {new Date(pass.validUntil).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Usage Count</span>
                      <span className="font-mono font-bold text-gray-800">
                        {pass.usesCount} / {pass.maxUses} uses
                      </span>
                    </div>
                  </div>

                  {/* Actions: Share / View Digital Pass + 1-Click Revoke */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPassToShare(pass)}
                      className="btn-secondary !text-xs !py-1.5 !px-3 flex items-center gap-1.5 flex-1 justify-center"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#cd0447]" />
                      <span>Digital Pass</span>
                    </button>

                    {isActive && (
                      <button
                        type="button"
                        onClick={() => setPasscodeToRevoke(pass)}
                        className="btn-secondary !text-xs !py-1.5 !px-2.5 !text-rose-600 hover:!bg-rose-50 hover:!border-rose-200"
                        title="Revoke pass immediately"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Generate Guest Passcode */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Generate Guest Passcode</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Create an instant 6-digit access code for visitors at Flat {unitNumber}
            </div>
          </div>
        }
        size="md"
      >
        <form onSubmit={handleCreatePasscode} className="space-y-5">
          {/* Validity Presets */}
          <div>
            <label className="form-label">Passcode Validity Duration</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handlePresetChange('6h')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                  durationPreset === '6h'
                    ? 'bg-pink-50 border-[#cd0447] text-[#cd0447] shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                6 Hours
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('12h')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                  durationPreset === '12h'
                    ? 'bg-pink-50 border-[#cd0447] text-[#cd0447] shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                12 Hours
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('24h')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                  durationPreset === '24h'
                    ? 'bg-pink-50 border-[#cd0447] text-[#cd0447] shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                24 Hours
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('weekend')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                  durationPreset === 'weekend'
                    ? 'bg-pink-50 border-[#cd0447] text-[#cd0447] shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                3 Days
              </button>
            </div>
          </div>

          {/* Valid Until Custom Picker */}
          <div>
            <label className="form-label">Valid Until (Expiry Date & Time)</label>
            <input
              type="datetime-local"
              required
              value={customValidUntil}
              onChange={(e) => {
                setCustomValidUntil(e.target.value);
                setDurationPreset('custom');
              }}
              className="input-base w-full font-mono text-xs"
            />
          </div>

          {/* Max Uses Selector */}
          <div>
            <label className="form-label">Maximum Number of Entries</label>
            <select
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="input-base w-full cursor-pointer text-xs"
            >
              <option value={1}>1 Use (Single Guest Entry — Recommended)</option>
              <option value={2}>2 Uses (Entry + Re-entry)</option>
              <option value={5}>5 Uses (Contractor / Delivery Group)</option>
              <option value={999}>Unlimited Uses (During Valid Window)</option>
            </select>
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsGenerateModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="btn-primary flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate Passcode</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Digital Pass & QR Share Modal */}
      <Modal
        isOpen={Boolean(selectedPassToShare)}
        onClose={() => setSelectedPassToShare(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">Digital Gate Pass</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Share with your guest via WhatsApp, SMS, or direct link
            </div>
          </div>
        }
        size="sm"
      >
        {selectedPassToShare && (
          <div className="space-y-6 text-center">
            {/* Pass Ticket Design */}
            <div className="p-6 rounded-3xl bg-gradient-to-b from-[#cd0447] to-[#9c0335] text-white shadow-xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-pink-200">
                <span className="font-bold tracking-wider uppercase">{societyName}</span>
                <span className="font-mono">Unit {unitNumber}</span>
              </div>

              {/* QR Code Graphic Box */}
              <div className="w-36 h-36 mx-auto bg-white rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-inner">
                {/* SVG Visualized QR Code Pattern */}
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full text-gray-900"
                  fill="currentColor"
                >
                  <rect x="10" y="10" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="17" y="17" width="11" height="11" />
                  <rect x="65" y="10" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="72" y="17" width="11" height="11" />
                  <rect x="10" y="65" width="25" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="6" />
                  <rect x="17" y="72" width="11" height="11" />
                  <rect x="42" y="10" width="16" height="6" />
                  <rect x="42" y="24" width="16" height="6" />
                  <rect x="42" y="38" width="16" height="16" />
                  <rect x="65" y="42" width="25" height="6" />
                  <rect x="10" y="42" width="25" height="6" />
                  <rect x="65" y="65" width="12" height="12" />
                  <rect x="80" y="80" width="10" height="10" />
                  <rect x="42" y="65" width="16" height="25" />
                </svg>
              </div>

              {/* 6-Digit Bold Code */}
              <div className="space-y-0.5">
                <div className="text-xs text-pink-200 uppercase font-semibold tracking-wider">
                  Gate PIN Code
                </div>
                <div className="text-4xl font-black font-mono tracking-widest text-white select-all">
                  {selectedPassToShare.code}
                </div>
              </div>

              <div className="text-[11px] text-pink-100 border-t border-white/20 pt-2 flex items-center justify-between">
                <span>Valid until:</span>
                <span className="font-semibold">
                  {new Date(selectedPassToShare.validUntil).toLocaleTimeString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {/* Copy Pass Message Button */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleCopyPassMessage(selectedPassToShare)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {hasCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied Message to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Pass Message (WhatsApp / SMS)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedPassToShare(null)}
                className="btn-secondary w-full"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation Dialog: Revoke Passcode */}
      <ConfirmDialog
        isOpen={Boolean(passcodeToRevoke)}
        title="Revoke Guest Passcode"
        message={`Are you sure you want to revoke PIN code "${passcodeToRevoke?.code}" immediately? Any visitor holding this PIN will be rejected at the security gate.`}
        confirmLabel="Revoke Passcode"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isRevoking}
        onConfirm={handleRevokePasscode}
        onCancel={() => setPasscodeToRevoke(null)}
      />
    </div>
  );
};

export default PasscodesPage;
