import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Camera,
  Filter,
  ShieldCheck,
  Radio,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import type { EntryEvent, SubjectType } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';

export const ActivityPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { latestEntryEvent } = useRealtime();
  const toast = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'Flat';

  const [events, setEvents] = useState<EntryEvent[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');

  // Photo / Event Detail Modal
  const [selectedEventModal, setSelectedEventModal] = useState<EntryEvent | null>(null);

  const fetchEvents = useCallback(
    async (pageNumber = 1, showRefreshing = false) => {
      if (!unitId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const res = await residentApi.getEntryEvents(unitId, pageNumber, 15);
        setEvents(res.data || []);
        const total = res.total ?? res.data?.length ?? 0;
        setTotalCount(total);
        setTotalPages(Math.max(1, Math.ceil(total / 15)));
        setPage(pageNumber);
      } catch (err: any) {
        console.error('Failed to load entry events:', err);
        toast.error('Failed to load entry logs.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [unitId, toast],
  );

  useEffect(() => {
    fetchEvents(page);
  }, [fetchEvents, page]);

  // Real-time new event listener
  useEffect(() => {
    if (latestEntryEvent && (!latestEntryEvent.unitId || latestEntryEvent.unitId === unitId)) {
      setEvents((prev) => {
        const exists = prev.some((e) => e.id === latestEntryEvent.id);
        if (exists) return prev;
        return [latestEntryEvent, ...prev];
      });
      setTotalCount((prev) => prev + 1);
    }
  }, [latestEntryEvent, unitId]);

  // Check URL query param ?id=... to auto-open event preview
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam && events.length > 0) {
      const match = events.find((e) => e.id === idParam);
      if (match) setSelectedEventModal(match);
    }
  }, [searchParams, events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (evt.visitorName && evt.visitorName.toLowerCase().includes(q)) ||
        (evt.staffName && evt.staffName.toLowerCase().includes(q)) ||
        (evt.visitorPhone && evt.visitorPhone.includes(q)) ||
        (evt.platform && evt.platform.toLowerCase().includes(q));

      const matchSubject =
        subjectFilter === 'ALL' || evt.subjectType === subjectFilter;

      const matchDirection =
        directionFilter === 'ALL' || evt.direction === directionFilter;

      return matchSearch && matchSubject && matchDirection;
    });
  }, [events, searchQuery, subjectFilter, directionFilter]);

  const getSubjectBadgeVariant = (type?: SubjectType | string): 'brand' | 'warning' | 'info' | 'success' | 'neutral' => {
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

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Unit Entry & Access Timeline"
        subtitle={`Complete visual audit log of all arrivals, deliveries, and domestic helper scans at Flat ${unitNumber}`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchEvents(page, true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh timeline"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
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
            placeholder="Search by visitor, helper, or courier..."
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
            <option value="IN">CHECK-IN (Entry)</option>
            <option value="OUT">CHECK-OUT (Exit)</option>
          </select>
        </div>
      </div>

      {/* Activity Timeline List / Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={5} rows={6} />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No entry activity recorded yet"
            description="Entry events from guard kiosk, face biometric scanners, and guest passcodes will appear here."
          />
        ) : filteredEvents.length === 0 ? (
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
                  <th>Direction & Time</th>
                  <th>Subject / Visitor</th>
                  <th>Category</th>
                  <th>Verification Method</th>
                  <th>Approval Status</th>
                  <th className="text-right">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((evt) => {
                  const isEntry = evt.direction === 'IN';
                  const displayName =
                    evt.visitorName ||
                    evt.staffName ||
                    (evt.platform ? `${evt.platform} Partner` : 'Guest Visitor');

                  return (
                    <tr
                      key={evt.id}
                      onClick={() => setSelectedEventModal(evt)}
                      className="hover:bg-gray-50/80 cursor-pointer group"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                              isEntry
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {isEntry ? (
                              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-900">
                              {evt.occurredAt
                                ? new Date(evt.occurredAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {evt.occurredAt
                                ? new Date(evt.occurredAt).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="font-semibold text-gray-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-pink-50 text-[#cd0447] border border-pink-100 flex items-center justify-center font-bold text-xs shrink-0">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-900 group-hover:text-[#cd0447] transition-colors">
                              {displayName}
                            </div>
                            {evt.visitorPhone && (
                              <div className="text-xs text-gray-500 font-mono">
                                {evt.visitorPhone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={getSubjectBadgeVariant(evt.subjectType)} size="sm">
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
                        <div className="text-xs font-mono text-gray-700 flex items-center gap-1.5">
                          {evt.source === 'M50_DEVICE' ? (
                            <>
                              <Radio className="w-3.5 h-3.5 text-indigo-500" />
                              <span>M50 Face Biometrics</span>
                            </>
                          ) : evt.source === 'PASSCODE' ? (
                            <>
                              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                              <span>Passcode PIN</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
                              <span>Guard Kiosk Check-in</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td>
                        <Badge
                          variant={
                            evt.approvalStatus === 'APPROVED' || evt.approvalStatus === 'AUTO_APPROVED'
                              ? 'success'
                              : evt.approvalStatus === 'REJECTED'
                              ? 'danger'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {evt.approvalStatus || (isEntry ? 'CHECKED IN' : 'CHECKED OUT')}
                        </Badge>
                      </td>

                      <td className="text-right">
                        {evt.hasPhoto ? (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#cd0447] group-hover:underline">
                            <Camera className="w-3.5 h-3.5" />
                            <span>Photo</span>
                          </div>
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

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-4">
            <span className="text-xs text-gray-500">
              Showing Page {page} of {totalPages} ({totalCount} total entries)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-secondary !text-xs !py-1.5 !px-3 flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn-secondary !text-xs !py-1.5 !px-3 flex items-center gap-1 disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Entry Event Details & Snapshot Viewer */}
      <Modal
        isOpen={Boolean(selectedEventModal)}
        onClose={() => setSelectedEventModal(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">
              Entry Record:{' '}
              {selectedEventModal?.visitorName ||
                selectedEventModal?.staffName ||
                (selectedEventModal?.platform
                  ? `${selectedEventModal.platform} Delivery`
                  : 'Visitor Event')}
            </div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              {selectedEventModal?.occurredAt
                ? new Date(selectedEventModal.occurredAt).toLocaleString()
                : ''}
            </div>
          </div>
        }
        size="md"
      >
        {selectedEventModal && (
          <div className="space-y-5">
            {/* Captured Photo Snapshot */}
            {selectedEventModal.hasPhoto && (
              <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black/5 aspect-4/3 flex items-center justify-center">
                <img
                  src={`/api/v1/mobile/entry-events/${selectedEventModal.id}/photo`}
                  alt="Visitor capture"
                  className="w-full h-full object-contain max-h-[50vh]"
                />
              </div>
            )}

            {/* Event Meta Details Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div>
                <span className="text-gray-400 block">Subject Type</span>
                <span className="font-bold text-gray-900 mt-0.5 block">
                  {selectedEventModal.subjectType}
                  {selectedEventModal.platform ? ` (${selectedEventModal.platform})` : ''}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Movement Direction</span>
                <span className="font-bold text-gray-900 mt-0.5 block">
                  {selectedEventModal.direction === 'IN' ? 'CHECK-IN (Entered)' : 'CHECK-OUT (Exited)'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Verification Source</span>
                <span className="font-mono text-gray-800 mt-0.5 block">
                  {selectedEventModal.source === 'M50_DEVICE'
                    ? 'M50 Facial Recognition'
                    : selectedEventModal.source === 'PASSCODE'
                    ? '6-Digit Guest Passcode'
                    : 'Security Gate Desk'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Gate Location</span>
                <span className="font-mono text-gray-800 mt-0.5 block">
                  {selectedEventModal.gateId ? `Gate #${selectedEventModal.gateId.slice(0, 6)}` : 'Main Entry Gate'}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEventModal(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ActivityPage;
