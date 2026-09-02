import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  History,
  RefreshCw,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Camera,
  Clock,
  Home,
  Phone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { societyAdminApi } from '../../api/society-admin.api';
import type { EntryEvent } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useCache } from '../../context/CacheContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const LOGS_KEY = (societyId: string, page: number, limit: number) =>
  `admin/gate-logs|society:${societyId}|page:${page}|limit:${limit}`;

export const GateLogsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { latestEntryEvent } = useRealtime();
  const cache = useCache();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [page, setPage] = useState<number>(1);
  const limit = 20;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');

  // Selected event for Photo & Details Modal
  const [selectedEvent, setSelectedEvent] = useState<EntryEvent | null>(null);

  const logsKey = useMemo(
    () => LOGS_KEY(societyId || 'none', page, limit),
    [societyId, page, limit],
  );

  const {
    data: logsData,
    isLoading,
    isRefreshing,
    refetch,
  } = useCachedFetch<EntryEvent[]>(
    logsKey,
    async () => {
      const res = await societyAdminApi.getLogs(societyId, page, limit);
      return res.data || [];
    },
    { deps: [societyId, page, limit], skipInitialFetch: !societyId },
  );

  const logs: EntryEvent[] = useMemo(() => logsData ?? [], [logsData]);

  // The cached total is kept under a sibling key, parallel to the page key.
  const totalKey = useMemo(
    () => `admin/gate-logs/total|society:${societyId || 'none'}|limit:${limit}`,
    [societyId, limit],
  );
  const totalCount = cache.get<number>(totalKey)?.data ?? logs.length;

  // Whenever we get a fresh page result, also remember its total.
  useEffect(() => {
    if (societyId) {
      // Re-fetch with side effect of stashing total: piggyback on the page fetch.
      (async () => {
        try {
          const res = await societyAdminApi.getLogs(societyId, page, limit);
          if (typeof res.total === 'number') {
            cache.set<number>(totalKey, res.total, null);
          }
        } catch {
          // Already surfaced via useCachedFetch.
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societyId, page, limit]);

  // Check URL query param ?id=...
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (targetId && logs.length > 0) {
      const match = logs.find((l) => l.id === targetId);
      if (match) {
        setSelectedEvent(match);
      }
    }
  }, [searchParams, logs]);

  // Real-time Event Subscription: prepend newly received entry events into page 1
  useEffect(() => {
    if (!latestEntryEvent) return;
    if (latestEntryEvent.societyId && latestEntryEvent.societyId !== societyId) return;
    if (page !== 1) return;
    const existing = cache.get<EntryEvent[]>(logsKey)?.data ?? [];
    const exists = existing.some((e) => e.id === latestEntryEvent.id);
    if (!exists) {
      cache.set<EntryEvent[]>(logsKey, [latestEntryEvent, ...existing].slice(0, limit), null);
    }
  }, [latestEntryEvent, societyId, page, logsKey, limit, cache]);

  const refresh = useCallback(() => refetch(true), [refetch]);

  // Filtered logs (client-side search & filtering across current set)
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        (log.visitorName && log.visitorName.toLowerCase().includes(q)) ||
        (log.visitorPhone && log.visitorPhone.includes(q)) ||
        (log.unitNumber && log.unitNumber.toLowerCase().includes(q)) ||
        (log.staffName && log.staffName.toLowerCase().includes(q)) ||
        (log.platform && log.platform.toLowerCase().includes(q));

      const matchSubject =
        subjectFilter === 'ALL' || log.subjectType === subjectFilter;

      const matchDirection =
        directionFilter === 'ALL' || log.direction === directionFilter;

      return matchSearch && matchSubject && matchDirection;
    });
  }, [logs, searchQuery, subjectFilter, directionFilter]);

  const getSubjectBadgeVariant = (type?: string): 'brand' | 'warning' | 'info' | 'success' | 'neutral' => {
    switch (type) {
      case 'VISITOR':
        return 'brand';
      case 'DELIVERY':
        return 'warning';
      case 'STAFF':
        return 'info';
      case 'RESIDENT':
        return 'success';
      default:
        return 'neutral';
    }
  };

  const getApprovalBadgeVariant = (status?: string | null): 'success' | 'danger' | 'warning' | 'neutral' => {
    switch (status) {
      case 'APPROVED':
      case 'AUTO_APPROVED':
        return 'success';
      case 'REJECTED':
        return 'danger';
      case 'PENDING':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getVisitorPhotoUrl = (entryEventId: string) => {
    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    return `${baseUrl}/api/v1/mobile/entry-events/${entryEventId}/photo`;
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Gate Access Activity Logs"
        subtitle="Real-time chronological audit trail of all vehicle, visitor, delivery, and staff entries"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh logs"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Filters and Search Bar */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search visitor, phone, unit, delivery..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="input-base !py-1.5 !text-xs w-36 cursor-pointer"
            >
              <option value="ALL">All Subjects</option>
              <option value="VISITOR">Visitors</option>
              <option value="DELIVERY">Deliveries</option>
              <option value="STAFF">Domestic Staff</option>
              <option value="RESIDENT">Residents</option>
            </select>
          </div>

          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-32 cursor-pointer"
          >
            <option value="ALL">All Directions</option>
            <option value="IN">IN (Check-in)</option>
            <option value="OUT">OUT (Exit)</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={6} rows={8} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={History}
            title="No gate activity events recorded"
            description="Gate verifications and M50 logs will appear here in real-time."
          />
        ) : filteredLogs.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setSubjectFilter('ALL');
              setDirectionFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Visitor / Subject</th>
                  <th>Type & Source</th>
                  <th>Destination / Unit</th>
                  <th>Timestamp</th>
                  <th>Photo</th>
                  <th className="text-right">Approval Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isEntry = log.direction === 'IN';
                  const displayName =
                    log.visitorName ||
                    log.staffName ||
                    (log.platform ? `${log.platform} Delivery` : 'Visitor');

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedEvent(log)}
                      className="hover:bg-gray-50/80 cursor-pointer group transition-colors"
                    >
                      {/* Direction */}
                      <td>
                        <div
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                            isEntry
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isEntry ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          )}
                          <span>{log.direction}</span>
                        </div>
                      </td>

                      {/* Subject Name & Phone */}
                      <td className="font-semibold text-gray-900">
                        <div className="flex items-center gap-2.5">
                          <div>
                            <div className="text-sm font-bold text-gray-900 group-hover:text-[#cd0447] transition-colors">
                              {displayName}
                            </div>
                            {log.visitorPhone && (
                              <div className="text-xs text-gray-400 font-mono flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-gray-400" />
                                {log.visitorPhone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type & Source */}
                      <td>
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={getSubjectBadgeVariant(log.subjectType)} size="sm">
                              {log.subjectType}
                            </Badge>
                            {log.platform && (
                              <Badge variant="warning" size="sm">
                                {log.platform}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {log.source === 'M50_DEVICE' ? 'M50 Face Terminal' : 'Guard Kiosk'}
                          </span>
                        </div>
                      </td>

                      {/* Destination Unit */}
                      <td>
                        {log.unitNumber ? (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                            <Home className="w-3.5 h-3.5 text-[#cd0447]" />
                            <span>Unit {log.unitNumber}</span>
                            {log.buildingName && (
                              <span className="text-gray-400 font-normal">
                                ({log.buildingName})
                              </span>
                            )}
                          </div>
                        ) : log.staffId ? (
                          <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            Domestic Staff
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Common Area</span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="text-xs text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {log.occurredAt
                              ? new Date(log.occurredAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Just now'}
                          </span>
                        </div>
                      </td>

                      {/* Photo indicator */}
                      <td>
                        {log.hasPhoto ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-md">
                            <Camera className="w-3 h-3 text-[#cd0447]" />
                            Photo
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Approval Status */}
                      <td className="text-right">
                        <Badge
                          variant={getApprovalBadgeVariant(log.approvalStatus)}
                          size="sm"
                          dot
                        >
                          {log.approvalStatus || 'LOGGED'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > limit && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-800">{(page - 1) * limit + 1}</span> to{' '}
              <span className="font-semibold text-gray-800">
                {Math.min(page * limit, totalCount)}
              </span>{' '}
              of <span className="font-semibold text-gray-800">{totalCount}</span> entries
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <span className="text-xs font-semibold text-gray-700 px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || isLoading}
                className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal / Drawer: Visitor Photo & Entry Detail Inspection */}
      <Modal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">Gate Verification Detail</div>
            <div className="text-xs text-gray-500 font-mono mt-0.5">
              Audit ID: {selectedEvent?.id || ''}
            </div>
          </div>
        }
      >
        {selectedEvent && (
          <div className="space-y-5">
            {/* Photo Preview Container */}
            <div className="rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 relative aspect-video sm:aspect-[16/10] flex items-center justify-center">
              {selectedEvent.hasPhoto ? (
                <img
                  src={getVisitorPhotoUrl(selectedEvent.id)}
                  alt="Visitor capture"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to placeholder if streaming endpoint has no image file
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60';
                  }}
                />
              ) : (
                <div className="text-center p-6 text-gray-400">
                  <Camera className="w-12 h-12 mx-auto text-gray-600 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold text-gray-300">No Photo Captured</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Event generated via {selectedEvent.source}.
                  </p>
                </div>
              )}

              {/* Status Overlay Badge */}
              <div className="absolute top-3 right-3">
                <Badge
                  variant={
                    selectedEvent.direction === 'IN' ? 'success' : 'danger'
                  }
                  size="sm"
                >
                  {selectedEvent.direction === 'IN' ? 'INCOMING ENTRY' : 'GATE EXIT'}
                </Badge>
              </div>
            </div>

            {/* Event Metadata Breakdown */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/70">
                <span className="text-gray-400 font-medium block">Visitor / Person</span>
                <span className="font-bold text-gray-900 text-sm mt-0.5 block">
                  {selectedEvent.visitorName || selectedEvent.staffName || 'Guest'}
                </span>
                {selectedEvent.visitorPhone && (
                  <span className="text-gray-500 font-mono text-[11px] block mt-0.5">
                    {selectedEvent.visitorPhone}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/70">
                <span className="text-gray-400 font-medium block">Target Residence</span>
                <span className="font-bold text-gray-900 text-sm mt-0.5 block">
                  {selectedEvent.unitNumber ? `Unit ${selectedEvent.unitNumber}` : 'Common Area'}
                </span>
                {selectedEvent.buildingName && (
                  <span className="text-gray-500 text-[11px] block mt-0.5">
                    {selectedEvent.buildingName}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/70">
                <span className="text-gray-400 font-medium block">Capture Source</span>
                <span className="font-bold text-indigo-700 mt-0.5 block">
                  {selectedEvent.source === 'M50_DEVICE' ? 'M50 Face Biometrics' : 'Guard Kiosk App'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/70">
                <span className="text-gray-400 font-medium block">Verification Time</span>
                <span className="font-semibold text-gray-900 mt-0.5 block">
                  {selectedEvent.occurredAt
                    ? new Date(selectedEvent.occurredAt).toLocaleString()
                    : '—'}
                </span>
              </div>
            </div>

            <div className="modal-footer pt-2">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="btn-secondary w-full"
              >
                Close Inspection
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default GateLogsPage;
