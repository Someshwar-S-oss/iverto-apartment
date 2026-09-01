import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Megaphone,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Pin,
  Calendar,
  Wrench,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import type {
  Notice,
  NoticeCategory,
  Complaint,
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
} from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const CommunityPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'Flat';
  const societyName = activeContext?.societyName || 'Society';

  const [activeTab, setActiveTab] = useState<'notices' | 'complaints'>('notices');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Notice Read Modal
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  // Raise Complaint Modal & Form
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState<boolean>(false);
  const [complaintForm, setComplaintForm] = useState<{
    title: string;
    description: string;
    category: ComplaintCategory;
    priority: ComplaintPriority;
  }>({
    title: '',
    description: '',
    category: 'PLUMBING',
    priority: 'MEDIUM',
  });
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState<boolean>(false);

  // Complaint Detail Modal
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Sync with URL query params ?tab=complaints & ?action=raise
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'complaints') {
      setActiveTab('complaints');
    }

    if (searchParams.get('action') === 'raise') {
      setActiveTab('complaints');
      setIsRaiseModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch notices & complaints — both scoped server-side to this resident's own unit
  // and society (see mobile-resident.controller.ts), so no client-side filtering needed.
  const fetchCommunityData = useCallback(
    async (showRefreshing = false) => {
      if (!unitId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [noticesData, complaintsData] = await Promise.all([
          residentApi.getNotices(unitId).catch(() => []),
          residentApi.getComplaints(unitId).catch(() => []),
        ]);

        setNotices(noticesData || []);
        setComplaints(complaintsData || []);
      } catch (err: any) {
        console.error('Failed to load community updates:', err);
        toastError('Failed to fetch community updates.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [unitId, toastError],
  );

  useEffect(() => {
    fetchCommunityData();
  }, [fetchCommunityData]);

  // Handle Submit New Complaint
  const handleRaiseComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !complaintForm.title || !complaintForm.description) return;

    setIsSubmittingComplaint(true);
    try {
      const created = await residentApi.createComplaint(unitId, {
        title: complaintForm.title.trim(),
        description: complaintForm.description.trim(),
        category: complaintForm.category,
        priority: complaintForm.priority,
      });

      toastSuccess(`Helpdesk ticket #${created.id.slice(-4)} submitted successfully.`);
      setIsRaiseModalOpen(false);
      setComplaintForm({
        title: '',
        description: '',
        category: 'PLUMBING',
        priority: 'MEDIUM',
      });
      await fetchCommunityData(true);
    } catch (err: any) {
      console.error('Failed to raise complaint:', err);
      toastError(err.response?.data?.message || 'Failed to submit complaint.');
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  // Filtered Notices
  const filteredNotices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return notices;
    return notices.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q),
    );
  }, [notices, searchQuery]);

  // Filtered Complaints
  const filteredComplaints = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return complaints;
    return complaints.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [complaints, searchQuery]);

  const getNoticeBadge = (cat: NoticeCategory) => {
    switch (cat) {
      case 'EMERGENCY':
        return <Badge variant="danger" size="sm">EMERGENCY</Badge>;
      case 'SECURITY':
        return <Badge variant="brand" size="sm">SECURITY</Badge>;
      case 'MAINTENANCE':
        return <Badge variant="warning" size="sm">MAINTENANCE</Badge>;
      case 'EVENT':
        return <Badge variant="purple" size="sm">EVENT</Badge>;
      default:
        return <Badge variant="info" size="sm">GENERAL</Badge>;
    }
  };

  const getComplaintStatusBadge = (status: ComplaintStatus) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="warning" size="sm" dot>OPEN</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="info" size="sm" dot>IN PROGRESS</Badge>;
      case 'RESOLVED':
        return <Badge variant="success" size="sm" dot>RESOLVED</Badge>;
      case 'CLOSED':
        return <Badge variant="neutral" size="sm">CLOSED</Badge>;
    }
  };

  const getComplaintPriorityBadge = (p: ComplaintPriority) => {
    switch (p) {
      case 'URGENT':
        return <Badge variant="danger" size="sm">URGENT</Badge>;
      case 'HIGH':
        return <Badge variant="warning" size="sm">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="info" size="sm">MEDIUM</Badge>;
      case 'LOW':
        return <Badge variant="neutral" size="sm">LOW</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title={`${societyName} — Community & Helpdesk`}
        subtitle="Society notices, administrative circulars, and residential maintenance requests"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchCommunityData(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh community board"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            {activeTab === 'complaints' && (
              <button
                type="button"
                onClick={() => setIsRaiseModalOpen(true)}
                className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Raise Complaint</span>
              </button>
            )}
          </div>
        }
      />

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1.5 bg-gray-100/90 rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('notices')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'notices'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Megaphone className="w-4 h-4 text-[#cd0447]" />
            <span>Society Notices ({notices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('complaints')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'complaints'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageSquareWarning className="w-4 h-4 text-indigo-600" />
            <span>My Complaints ({complaints.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={
              activeTab === 'notices'
                ? 'Search announcements...'
                : 'Search maintenance tickets...'
            }
            className="w-full"
          />
        </div>
      </div>

      {/* TAB 1: Society Notices & Announcements */}
      {activeTab === 'notices' && (
        <div className="space-y-6">
          {isLoading ? (
            <TableSkeleton columns={3} rows={4} />
          ) : notices.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No society announcements published"
              description="Notices from society management and security will appear on this bulletin board."
            />
          ) : filteredNotices.length === 0 ? (
            <NoResultsState
              query={searchQuery}
              onClear={() => setSearchQuery('')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredNotices.map((notice) => (
                <div
                  key={notice.id}
                  onClick={() => setSelectedNotice(notice)}
                  className={`card p-6 border-2 transition-all cursor-pointer hover:shadow-md flex flex-col justify-between gap-4 group ${
                    notice.isPinned
                      ? 'border-pink-200 bg-gradient-to-b from-white to-pink-50/25'
                      : 'border-gray-200/80 bg-white'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {notice.isPinned && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#cd0447] bg-pink-100 px-2 py-0.5 rounded-full">
                            <Pin className="w-3 h-3 rotate-45" />
                            PINNED
                          </span>
                        )}
                        {getNoticeBadge(notice.category)}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(notice.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 group-hover:text-[#cd0447] transition-colors leading-snug">
                      {notice.title}
                    </h3>

                    <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                      {notice.body}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                    <span>Published by {notice.authorName || 'Management'}</span>
                    <span className="text-[#cd0447] font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>Read More</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Resident Helpdesk Complaints */}
      {activeTab === 'complaints' && (
        <div className="space-y-6">
          {/* Quick Action banner to raise ticket */}
          <div className="card-static p-5 bg-gradient-to-r from-indigo-50/60 via-white to-pink-50/40 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Need Maintenance Support?</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Report plumbing, electrical, elevator, noise, or parking issues for Flat {unitNumber}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRaiseModalOpen(true)}
              className="btn-primary text-xs !py-2 !px-4 flex items-center gap-2 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Raise New Ticket</span>
            </button>
          </div>

          {/* Complaints Table */}
          <div className="card-static overflow-hidden">
            {isLoading ? (
              <div className="p-6">
                <TableSkeleton columns={5} rows={4} />
              </div>
            ) : complaints.length === 0 ? (
              <EmptyState
                icon={MessageSquareWarning}
                title="No complaints or tickets raised"
                description="If you experience facility issues with water, electricity, or elevators, submit a ticket here."
                action={
                  <button
                    type="button"
                    onClick={() => setIsRaiseModalOpen(true)}
                    className="btn-primary text-xs"
                  >
                    Raise First Ticket
                  </button>
                }
              />
            ) : filteredComplaints.length === 0 ? (
              <NoResultsState
                query={searchQuery}
                onClear={() => setSearchQuery('')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticket Title & Category</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Date Logged</th>
                      <th>Admin Resolution Notes</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplaints.map((cmp) => (
                      <tr
                        key={cmp.id}
                        onClick={() => setSelectedComplaint(cmp)}
                        className="hover:bg-gray-50/80 cursor-pointer group"
                      >
                        <td className="font-semibold text-gray-900">
                          <div>
                            <div className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                              {cmp.title}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Category: {cmp.category.replace(/_/g, ' ')}
                            </div>
                          </div>
                        </td>
                        <td>{getComplaintPriorityBadge(cmp.priority)}</td>
                        <td>{getComplaintStatusBadge(cmp.status)}</td>
                        <td>
                          <span className="text-xs text-gray-600 font-mono">
                            {new Date(cmp.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </td>
                        <td className="max-w-xs truncate">
                          {cmp.adminNotes ? (
                            <span className="text-xs text-emerald-700 font-medium">
                              {cmp.adminNotes}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Under review</span>
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedComplaint(cmp);
                            }}
                            className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1.5 ml-auto"
                          >
                            <Eye className="w-3.5 h-3.5 text-gray-500" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Read Notice Detail */}
      <Modal
        isOpen={Boolean(selectedNotice)}
        onClose={() => setSelectedNotice(null)}
        title={
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900">{selectedNotice?.title || ''}</span>
              {selectedNotice && getNoticeBadge(selectedNotice.category)}
            </div>
            {selectedNotice && (
              <div className="text-xs text-gray-500 font-normal mt-1 flex items-center gap-2">
                <span>By {selectedNotice.authorName || 'Management'}</span>
                <span>•</span>
                <span>{new Date(selectedNotice.createdAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        }
        size="md"
      >
        {selectedNotice && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {selectedNotice.body}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedNotice(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Raise Complaint */}
      <Modal
        isOpen={isRaiseModalOpen}
        onClose={() => setIsRaiseModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Raise Helpdesk Ticket</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Submit maintenance or security request for Flat {unitNumber}
            </div>
          </div>
        }
        size="md"
      >
        <form onSubmit={handleRaiseComplaint} className="space-y-4">
          <div>
            <label className="form-label">
              Issue Summary / Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={complaintForm.title}
              onChange={(e) => setComplaintForm({ ...complaintForm, title: e.target.value })}
              placeholder="e.g. Water leakage in master bathroom ceiling"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Category</label>
              <select
                value={complaintForm.category}
                onChange={(e) =>
                  setComplaintForm({ ...complaintForm, category: e.target.value as ComplaintCategory })
                }
                className="input-base w-full cursor-pointer text-xs"
              >
                <option value="PLUMBING">Plumbing / Water</option>
                <option value="ELECTRICAL">Electrical / Lighting</option>
                <option value="LIFT_ELEVATOR">Elevator / Lift</option>
                <option value="SECURITY">Security / Boom Barrier</option>
                <option value="PARKING">Parking Dispute</option>
                <option value="NOISE">Noise Disturbance</option>
                <option value="CLEANLINESS">Corridor Cleanliness</option>
                <option value="OTHER">Other Issue</option>
              </select>
            </div>

            <div>
              <label className="form-label">Priority</label>
              <select
                value={complaintForm.priority}
                onChange={(e) =>
                  setComplaintForm({ ...complaintForm, priority: e.target.value as ComplaintPriority })
                }
                className="input-base w-full cursor-pointer text-xs"
              >
                <option value="LOW">Low (Can wait few days)</option>
                <option value="MEDIUM">Medium (Normal)</option>
                <option value="HIGH">High (Needs quick attention)</option>
                <option value="URGENT">Urgent (Safety / Leak Emergency)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">
              Detailed Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={complaintForm.description}
              onChange={(e) =>
                setComplaintForm({ ...complaintForm, description: e.target.value })
              }
              placeholder="Provide specific details, location, and timing of the issue..."
              className="input-base w-full text-xs"
            />
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsRaiseModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingComplaint || !complaintForm.title || !complaintForm.description}
              className="btn-primary flex items-center gap-2"
            >
              {isSubmittingComplaint ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Ticket</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: View Complaint Details */}
      <Modal
        isOpen={Boolean(selectedComplaint)}
        onClose={() => setSelectedComplaint(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">{selectedComplaint?.title || ''}</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Logged on{' '}
              {selectedComplaint
                ? new Date(selectedComplaint.createdAt).toLocaleString()
                : ''}
            </div>
          </div>
        }
        size="md"
      >
        {selectedComplaint && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {getComplaintStatusBadge(selectedComplaint.status)}
              {getComplaintPriorityBadge(selectedComplaint.priority)}
              <Badge variant="neutral" size="sm">
                {selectedComplaint.category.replace(/_/g, ' ')}
              </Badge>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
              <span className="font-bold block text-gray-900 mb-1">Issue Description:</span>
              {selectedComplaint.description}
            </div>

            {selectedComplaint.adminNotes && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
                <span className="font-bold block text-emerald-800 mb-1">
                  Management Update:
                </span>
                {selectedComplaint.adminNotes}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
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

export default CommunityPage;
