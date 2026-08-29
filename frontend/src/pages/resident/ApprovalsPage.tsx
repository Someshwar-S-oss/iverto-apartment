import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Truck,
  User as UserIcon,
  Sparkles,
  RefreshCw,
  Clock,
  Building,
  Phone,
  Camera,
  Check,
  X,
  History,
  Eye,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import type { Approval, EntryEvent, ApprovalStatus } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { SearchInput } from '../../components/ui/SearchInput';
import { Modal } from '../../components/ui/Modal';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';
import { playAllowChime, playDenyChime } from '../../components/real-time/SoundEffects';

export const ApprovalsPage: React.FC = () => {
  const { activeContext } = useRole();
  const { incomingApproval, clearIncomingApproval } = useRealtime();
  const toast = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'My Flat';

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingList, setPendingList] = useState<Approval[]>([]);
  const [historyList, setHistoryList] = useState<EntryEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [decidingId, setDecidingId] = useState<string | null>(null);

  // Photo viewer modal
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<{
    url: string;
    name: string;
    time?: string;
  } | null>(null);

  // Load Pending Approvals and Decision History
  const fetchData = useCallback(
    async (showRefreshing = false) => {
      if (!unitId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [pendingData, eventsData] = await Promise.all([
          residentApi.getPendingApprovals(unitId).catch(() => []),
          residentApi.getEntryEvents(unitId, 1, 50).catch(() => ({ data: [], total: 0 })),
        ]);

        setPendingList(pendingData || []);
        // Filter history for entries that have approval status or were decided
        setHistoryList(eventsData.data || []);
      } catch (err: any) {
        console.error('Failed to load approvals:', err);
        toast.error('Failed to fetch approvals. Please retry.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [unitId, toast],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time synchronization with WebSocket incomingApproval
  useEffect(() => {
    if (incomingApproval && (!incomingApproval.unitId || incomingApproval.unitId === unitId)) {
      setPendingList((prev) => {
        const exists = prev.some((a) => a.id === incomingApproval.approvalId);
        if (exists) return prev;

        const newApproval: Approval = {
          id: incomingApproval.approvalId,
          entryEventId: incomingApproval.entryEventId,
          unitId: incomingApproval.unitId || unitId,
          status: 'PENDING',
          validUntil: incomingApproval.expiresAt || new Date(Date.now() + 180000).toISOString(),
          createdAt: incomingApproval.createdAt || new Date().toISOString(),
          visitorName: incomingApproval.visitorName,
          visitorPhone: incomingApproval.visitorPhone,
          subjectType: incomingApproval.subjectType as any,
          platform: incomingApproval.platform as any,
          unitNumber: incomingApproval.unitNumber,
        };
        return [newApproval, ...prev];
      });
    }
  }, [incomingApproval, unitId]);

  // Handle Decision (Approve / Reject)
  const handleDecision = async (approvalId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!unitId || decidingId) return;
    setDecidingId(approvalId);

    try {
      if (decision === 'APPROVED') {
        playAllowChime();
      } else {
        playDenyChime();
      }

      await residentApi.decideApproval(unitId, approvalId, decision);
      toast.success(
        decision === 'APPROVED' ? 'Visitor entry authorized!' : 'Visitor entry rejected.',
      );

      // Remove from pending list
      setPendingList((prev) => prev.filter((a) => a.id !== approvalId));
      if (incomingApproval?.approvalId === approvalId) {
        clearIncomingApproval();
      }

      // Refresh history in background
      residentApi.getEntryEvents(unitId, 1, 50).then((res) => {
        if (res.data) setHistoryList(res.data);
      });
    } catch (err: any) {
      console.error('Failed to decide approval:', err);
      toast.error(err.response?.data?.message || 'Failed to submit decision to security gate.');
    } finally {
      setDecidingId(null);
    }
  };

  // Filtered Pending List
  const filteredPending = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return pendingList;
    return pendingList.filter((a) => {
      const name = (a.visitorName || '').toLowerCase();
      const phone = (a.visitorPhone || '').toLowerCase();
      const platform = (a.platform || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || platform.includes(q);
    });
  }, [pendingList, searchQuery]);

  // Filtered History List
  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return historyList;
    return historyList.filter((e) => {
      const name = (e.visitorName || e.staffName || '').toLowerCase();
      const phone = (e.visitorPhone || '').toLowerCase();
      const platform = (e.platform || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || platform.includes(q);
    });
  }, [historyList, searchQuery]);

  const getStatusBadge = (status?: ApprovalStatus | string | null) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success" size="sm" dot>APPROVED</Badge>;
      case 'AUTO_APPROVED':
        return <Badge variant="success" size="sm" dot>AUTO-APPROVED</Badge>;
      case 'REJECTED':
        return <Badge variant="danger" size="sm" dot>REJECTED</Badge>;
      case 'EXPIRED':
        return <Badge variant="neutral" size="sm">EXPIRED</Badge>;
      case 'PENDING':
      default:
        return <Badge variant="warning" size="sm" dot>PENDING</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Visitor Gate Approvals"
        subtitle={`Real-time authorization stream for guests, domestic helpers, and couriers at Flat ${unitNumber}`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh approvals"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Tab Buttons */}
        <div className="flex items-center gap-2 p-1.5 bg-gray-100/90 rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-[#cd0447]" />
            <span>Pending Approvals</span>
            {pendingList.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#cd0447] text-white animate-pulse">
                {pendingList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <History className="w-4 h-4 text-gray-500" />
            <span>Past Decisions History</span>
          </button>
        </div>

        {/* Search */}
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by visitor name, phone, or company..."
            className="w-full"
          />
        </div>
      </div>

      {/* TAB 1: Pending Approvals */}
      {activeTab === 'pending' && (
        <div className="space-y-6">
          {isLoading ? (
            <TableSkeleton columns={4} rows={3} />
          ) : pendingList.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No pending approval requests"
              description="When a visitor arrives at the gate without pre-approval, their request will chime and appear here instantly."
            />
          ) : filteredPending.length === 0 ? (
            <NoResultsState
              query={searchQuery}
              onClear={() => setSearchQuery('')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredPending.map((approval) => {
                const isDelivery =
                  approval.subjectType === 'DELIVERY' || Boolean(approval.platform);
                const isStaff = approval.subjectType === 'STAFF';
                const name =
                  approval.visitorName ||
                  (isDelivery ? `${approval.platform || 'Courier'} Partner` : 'Guest Visitor');
                const photoSrc = approval.entryEventId
                  ? `/api/v1/mobile/entry-events/${approval.entryEventId}/photo`
                  : null;

                return (
                  <div
                    key={approval.id}
                    className="card p-6 border-2 border-pink-200/80 shadow-lg bg-gradient-to-b from-white to-pink-50/20 flex flex-col justify-between gap-6 relative overflow-hidden"
                  >
                    {/* Top Tag */}
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#cd0447] animate-ping" />
                        <span className="text-xs font-bold text-[#cd0447] uppercase tracking-wider">
                          Waiting at Gate Desk
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(approval.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Visitor Snapshot & Details */}
                    <div className="flex items-start gap-4">
                      {/* Photo Thumbnail */}
                      <div
                        onClick={() => {
                          if (photoSrc) {
                            setSelectedPhotoModal({
                              url: photoSrc,
                              name,
                              time: new Date(approval.createdAt).toLocaleString(),
                            });
                          }
                        }}
                        className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 border-2 border-white shadow-md flex items-center justify-center bg-gray-100 relative group ${
                          photoSrc ? 'cursor-pointer' : ''
                        }`}
                      >
                        {photoSrc ? (
                          <>
                            <img
                              src={photoSrc}
                              alt={name}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                              <Eye className="w-5 h-5" />
                            </div>
                          </>
                        ) : isDelivery ? (
                          <div className="flex flex-col items-center justify-center text-amber-600">
                            <Truck className="w-8 h-8 mb-1" />
                            <span className="text-[9px] font-bold uppercase">{approval.platform || 'Delivery'}</span>
                          </div>
                        ) : isStaff ? (
                          <div className="flex flex-col items-center justify-center text-sky-600">
                            <Sparkles className="w-8 h-8 mb-1" />
                            <span className="text-[9px] font-bold uppercase">Staff</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-[#cd0447]">
                            <UserIcon className="w-8 h-8 mb-1" />
                            <span className="text-[9px] font-bold uppercase">Guest</span>
                          </div>
                        )}
                      </div>

                      {/* Meta Info */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                            {name}
                          </h3>
                          <Badge
                            variant={isDelivery ? 'warning' : isStaff ? 'info' : 'brand'}
                            size="sm"
                          >
                            {approval.subjectType || 'VISITOR'}
                          </Badge>
                          {approval.platform && (
                            <Badge variant="warning" size="sm">
                              {approval.platform}
                            </Badge>
                          )}
                        </div>

                        {approval.visitorPhone && (
                          <p className="text-xs text-gray-600 font-mono flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            <span>{approval.visitorPhone}</span>
                          </p>
                        )}

                        <div className="text-xs text-gray-500 flex items-center gap-2 pt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Building className="w-3.5 h-3.5 text-gray-400" />
                            Unit {approval.unitNumber || unitNumber}
                          </span>
                          <span>•</span>
                          <span className="text-gray-400">Security Barrier Hold</span>
                        </div>
                      </div>
                    </div>

                    {/* Large APPROVE (Green) & REJECT (Red) Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        disabled={decidingId === approval.id}
                        onClick={() => handleDecision(approval.id, 'REJECTED')}
                        className="py-3.5 px-4 rounded-xl font-bold text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 active:scale-[0.98] border-2 border-rose-200 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-5 h-5 stroke-[2.5]" />
                        <span>REJECT</span>
                      </button>

                      <button
                        type="button"
                        disabled={decidingId === approval.id}
                        onClick={() => handleDecision(approval.id, 'APPROVED')}
                        className="py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 active:scale-[0.98] shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-5 h-5 stroke-[2.5]" />
                        <span>APPROVE</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Past Decision History */}
      {activeTab === 'history' && (
        <div className="card-static overflow-hidden">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton columns={5} rows={6} />
            </div>
          ) : historyList.length === 0 ? (
            <EmptyState
              icon={History}
              title="No past approvals recorded"
              description="Historical decisions for visitors, couriers, and staff will appear here."
            />
          ) : filteredHistory.length === 0 ? (
            <NoResultsState
              query={searchQuery}
              onClear={() => setSearchQuery('')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Visitor / Subject</th>
                    <th>Type / Purpose</th>
                    <th>Contact Phone</th>
                    <th>Decision Status</th>
                    <th>Timestamp</th>
                    <th className="text-right">Snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((evt) => {
                    const isDelivery = evt.subjectType === 'DELIVERY' || Boolean(evt.platform);
                    const isStaff = evt.subjectType === 'STAFF';
                    const displayName =
                      evt.visitorName ||
                      evt.staffName ||
                      (evt.platform ? `${evt.platform} Partner` : 'Guest Visitor');
                    const photoSrc = evt.id
                      ? `/api/v1/mobile/entry-events/${evt.id}/photo`
                      : null;

                    return (
                      <tr key={evt.id} className="hover:bg-gray-50/80">
                        <td className="font-semibold text-gray-900">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-pink-50 text-[#cd0447] border border-pink-100 flex items-center justify-center font-bold text-sm shrink-0">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900">{displayName}</div>
                              <div className="text-[11px] text-gray-400 font-mono">
                                Gate: {evt.gateId ? `Gate #${evt.gateId.slice(0, 4)}` : 'Main Security Desk'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant={isDelivery ? 'warning' : isStaff ? 'info' : 'brand'}
                              size="sm"
                            >
                              {evt.subjectType}
                            </Badge>
                            {evt.platform && (
                              <Badge variant="warning" size="sm">
                                {evt.platform}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="text-xs font-mono text-gray-600">
                            {evt.visitorPhone || '—'}
                          </span>
                        </td>
                        <td>{getStatusBadge(evt.approvalStatus)}</td>
                        <td>
                          <div className="text-xs text-gray-700">
                            {evt.occurredAt
                              ? new Date(evt.occurredAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </div>
                        </td>
                        <td className="text-right">
                          {evt.hasPhoto && photoSrc ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPhotoModal({
                                  url: photoSrc,
                                  name: displayName,
                                  time: evt.occurredAt
                                    ? new Date(evt.occurredAt).toLocaleString()
                                    : undefined,
                                })
                              }
                              className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1.5 ml-auto"
                            >
                              <Camera className="w-3.5 h-3.5 text-gray-500" />
                              <span>View</span>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: High-Res Visitor Snapshot Preview */}
      <Modal
        isOpen={Boolean(selectedPhotoModal)}
        onClose={() => setSelectedPhotoModal(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">
              Visitor Snapshot: {selectedPhotoModal?.name || ''}
            </div>
            {selectedPhotoModal?.time && (
              <div className="text-xs text-gray-500 font-normal mt-0.5">
                Captured at {selectedPhotoModal.time}
              </div>
            )}
          </div>
        }
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black/5 aspect-4/3 flex items-center justify-center">
            {selectedPhotoModal?.url ? (
              <img
                src={selectedPhotoModal.url}
                alt={selectedPhotoModal.name}
                className="w-full h-full object-contain max-h-[60vh]"
              />
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedPhotoModal(null)}
              className="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ApprovalsPage;
