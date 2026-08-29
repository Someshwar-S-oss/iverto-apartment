import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LogOut,
  Search,
  User as UserIcon,
  Truck,
  Sparkles,
  Building,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Phone,
} from 'lucide-react';
import { guardApi } from '../../api/guard.api';
import { societyAdminApi } from '../../api/society-admin.api';
import type { EntryEvent } from '../../api/types';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { useRole } from '../../context/RoleContext';

export interface ExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  gateId: string;
  onSuccess?: (entryEvent: EntryEvent) => void;
}

export const ExitModal: React.FC<ExitModalProps> = ({
  isOpen,
  onClose,
  gateId,
  onSuccess,
}) => {
  const toast = useToast();
  const { activeContext } = useRole();
  const societyId = activeContext?.societyId || activeContext?.id || '';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [recentEntries, setRecentEntries] = useState<EntryEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMarkingExitId, setIsMarkingExitId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch recent entry logs to identify active visitors / staff
  const fetchRecentEntries = useCallback(async () => {
    if (!societyId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const logsResult = await societyAdminApi.getLogs(societyId, 1, 50);
      const data = logsResult.data || [];
      // Filter for recent IN entries that have not been marked OUT
      const inEntries = data.filter((e) => e.direction === 'IN');
      setRecentEntries(inEntries);
    } catch (err) {
      console.error('Failed to load active entries for exit checkout:', err);
    } finally {
      setIsLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setErrorMsg(null);
      fetchRecentEntries();
    }
  }, [isOpen, fetchRecentEntries]);

  // Execute Mark Exit
  const handleMarkExit = async (entryEventId: string, name?: string) => {
    if (!gateId || !entryEventId || isMarkingExitId) return;

    setIsMarkingExitId(entryEventId);
    setErrorMsg(null);

    try {
      const exitEvent = await guardApi.markExit(gateId, entryEventId);
      toast.success(`Check-out recorded for ${name || 'Visitor'}.`);

      // Remove from active list
      setRecentEntries((prev) => prev.filter((e) => e.id !== entryEventId));

      if (onSuccess) {
        onSuccess(exitEvent);
      }
    } catch (err: any) {
      console.error('Failed to mark exit:', err);
      const msg = err.response?.data?.message || 'Failed to record checkout.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsMarkingExitId(null);
    }
  };

  // Filtered active visitors list
  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return recentEntries;
    return recentEntries.filter((e) => {
      const name = (e.visitorName || e.staffName || '').toLowerCase();
      const phone = (e.visitorPhone || '').toLowerCase();
      const unit = (e.unitNumber || '').toLowerCase();
      const platform = (e.platform || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || unit.includes(q) || platform.includes(q);
    });
  }, [recentEntries, searchQuery]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gray-800 text-white flex items-center justify-center font-bold shadow-md">
            <LogOut className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-gray-900 text-lg sm:text-xl">
              Mark Visitor / Staff Exit
            </div>
            <div className="text-xs text-gray-500 font-normal">
              Record departure timestamp and checkout active visitors or domestic helpers
            </div>
          </div>
        </div>
      }
      size="lg"
      className="border-2 border-gray-200"
    >
      <div className="space-y-5">
        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2.5 text-xs font-semibold animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Search Active Visitors Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search active visitors by name, flat number (e.g. 402), or phone..."
            className="input-base !pl-10 w-full text-sm"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Active Visitors Inside List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-500 px-1">
            <span>Visitors & Staff Currently Inside ({filteredEntries.length})</span>
            <button
              type="button"
              onClick={fetchRecentEntries}
              className="text-[#cd0447] hover:underline flex items-center gap-1 normal-case font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
            {isLoading ? (
              <div className="py-12 text-center text-gray-400 space-y-2">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#cd0447]" />
                <p className="text-xs">Loading active visitor log...</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-gray-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                <div className="font-bold text-sm text-gray-800">
                  {searchQuery ? 'No matching visitors found' : 'No active visitors inside society'}
                </div>
                <p className="text-xs text-gray-400">
                  {searchQuery
                    ? 'Try searching with a different flat number or name.'
                    : 'All logged visitors and contractors have checked out.'}
                </p>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isDelivery = entry.subjectType === 'DELIVERY' || Boolean(entry.platform);
                const isStaff = entry.subjectType === 'STAFF';
                const displayName =
                  entry.visitorName ||
                  entry.staffName ||
                  (entry.platform ? `${entry.platform} Courier` : 'Guest Visitor');
                const isCheckingOut = isMarkingExitId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 shadow-xs flex items-center justify-between gap-4 transition-all"
                  >
                    {/* Visitor Avatar & Meta */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isDelivery
                            ? 'bg-amber-100 text-amber-700'
                            : isStaff
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-pink-100 text-[#cd0447]'
                        }`}
                      >
                        {isDelivery ? (
                          <Truck className="w-5 h-5" />
                        ) : isStaff ? (
                          <Sparkles className="w-5 h-5" />
                        ) : (
                          <UserIcon className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-gray-900 truncate">
                            {displayName}
                          </span>
                          <Badge
                            variant={isDelivery ? 'warning' : isStaff ? 'info' : 'brand'}
                            size="sm"
                          >
                            {entry.subjectType}
                          </Badge>
                          {entry.platform && (
                            <Badge variant="warning" size="sm">
                              {entry.platform}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          {entry.unitNumber && (
                            <span className="flex items-center gap-1 font-semibold text-gray-700">
                              <Building className="w-3.5 h-3.5 text-gray-400" />
                              Flat {entry.unitNumber}
                            </span>
                          )}

                          {entry.visitorPhone && (
                            <span className="flex items-center gap-1 font-mono text-gray-600">
                              <Phone className="w-3 h-3 text-gray-400" />
                              {entry.visitorPhone}
                            </span>
                          )}

                          <span className="flex items-center gap-1 font-mono text-gray-400">
                            <Clock className="w-3 h-3" />
                            {new Date(entry.occurredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 1-Tap Mark Exit Checkout Button */}
                    <button
                      type="button"
                      onClick={() => handleMarkExit(entry.id, displayName)}
                      disabled={isCheckingOut}
                      className="btn-secondary !bg-gray-900 hover:!bg-rose-700 !text-white !border-gray-900 hover:!border-rose-700 !py-2 !px-4 text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      {isCheckingOut ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Exiting...</span>
                        </>
                      ) : (
                        <>
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Check-Out</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary text-xs">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ExitModal;
