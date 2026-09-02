import React, { useState, useMemo } from 'react';
import {
  MessageSquareWarning,
  Clock,
  Filter,
  RefreshCw,
  Home,
  Edit2,
} from 'lucide-react';
import { societyAdminApi } from '../../api/society-admin.api';
import type { Complaint, ComplaintStatus, ComplaintPriority } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const COMPLAINTS_KEY = (societyId: string) => `admin/complaints|society:${societyId}`;

export const ComplaintsPage: React.FC = () => {
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Status Changer & Resolution Modal
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [newStatus, setNewStatus] = useState<ComplaintStatus>('IN_PROGRESS');
  const [adminNotesInput, setAdminNotesInput] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  const complaintsKey = useMemo(() => COMPLAINTS_KEY(societyId || 'none'), [societyId]);

  const {
    data: complaintsData,
    isLoading,
    isRefreshing,
    refetch,
  } = useCachedFetch<Complaint[]>(
    complaintsKey,
    () => societyAdminApi.getComplaints(societyId).then((data) => data || []),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const complaints = useMemo(() => complaintsData ?? [], [complaintsData]);

  // Open Status update modal
  const openStatusModal = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setNewStatus(complaint.status);
    setAdminNotesInput(complaint.adminNotes || '');
  };

  // Handle Submit Status update
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !selectedComplaint) return;

    setIsUpdatingStatus(true);
    try {
      await societyAdminApi.updateComplaintStatus(
        societyId,
        selectedComplaint.id,
        newStatus,
        adminNotesInput.trim() || undefined,
      );

      toastSuccess(`Complaint status updated to ${newStatus}.`);
      setSelectedComplaint(null);
      await refetch(true);
    } catch (err: any) {
      toastError('Failed to update complaint status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Filter complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.unitNumber && c.unitNumber.toLowerCase().includes(q)) ||
        (c.buildingName && c.buildingName.toLowerCase().includes(q)) ||
        c.residentName.toLowerCase().includes(q);

      const matchStatus =
        statusFilter === 'ALL' || c.status === statusFilter;

      const matchCategory =
        categoryFilter === 'ALL' || c.category === categoryFilter;

      return matchSearch && matchStatus && matchCategory;
    });
  }, [complaints, searchQuery, statusFilter, categoryFilter]);

  const getStatusBadge = (status: ComplaintStatus) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="danger" size="sm">OPEN</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning" size="sm">IN PROGRESS</Badge>;
      case 'RESOLVED':
        return <Badge variant="success" size="sm">RESOLVED</Badge>;
      case 'CLOSED':
        return <Badge variant="neutral" size="sm">CLOSED</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: ComplaintPriority) => {
    switch (priority) {
      case 'URGENT':
        return <Badge variant="danger" size="sm">URGENT</Badge>;
      case 'HIGH':
        return <Badge variant="warning" size="sm">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="info" size="sm">MEDIUM</Badge>;
      case 'LOW':
        return <Badge variant="neutral" size="sm">LOW</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{priority}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Resident Maintenance Complaints"
        subtitle="Manage and resolve residential tickets, maintenance requests, and work orders"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refetch(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh tickets"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Total Tickets</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{complaints.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Open Tickets</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">
            {complaints.filter((c) => c.status === 'OPEN').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">In Progress</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {complaints.filter((c) => c.status === 'IN_PROGRESS').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Resolved / Closed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {complaints.filter((c) => ['RESOLVED', 'CLOSED'].includes(c.status)).length}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tickets, unit, resident, keywords..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-base !py-1.5 !text-xs w-36 cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-36 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="PLUMBING">Plumbing</option>
            <option value="ELECTRICAL">Electrical</option>
            <option value="SECURITY">Security</option>
            <option value="PARKING">Parking</option>
            <option value="NOISE">Noise</option>
            <option value="CLEANLINESS">Cleanliness</option>
            <option value="LIFT_ELEVATOR">Lift / Elevator</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* Complaints Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={6} rows={6} />
          </div>
        ) : complaints.length === 0 ? (
          <EmptyState
            icon={MessageSquareWarning}
            title="No resident complaints logged"
            description="Resident maintenance requests and feedback tickets will appear here."
          />
        ) : filteredComplaints.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
              setCategoryFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket & Description</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Resident & Unit</th>
                  <th>Logged Date</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80">
                    {/* Title & Description */}
                    <td className="font-semibold text-gray-900 max-w-sm">
                      <div className="text-sm font-bold text-gray-900">{item.title}</div>
                      <div className="text-xs text-gray-500 line-clamp-1 mt-0.5 font-normal">
                        {item.description}
                      </div>
                      {item.adminNotes && (
                        <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mt-1.5 inline-block">
                          Note: {item.adminNotes}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td>
                      <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                    </td>

                    {/* Priority */}
                    <td>{getPriorityBadge(item.priority)}</td>

                    {/* Resident & Unit */}
                    <td>
                      <div className="text-xs">
                        <div className="font-semibold text-gray-900 flex items-center gap-1">
                          <Home className="w-3.5 h-3.5 text-[#cd0447]" />
                          <span>Unit {item.unitNumber || '—'}</span>
                          {item.buildingName && (
                            <span className="text-gray-400 font-normal">
                              ({item.buildingName})
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 mt-0.5">{item.residentName}</div>
                      </div>
                    </td>

                    {/* Timestamp */}
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td>{getStatusBadge(item.status)}</td>

                    {/* Action Button */}
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => openStatusModal(item)}
                        className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1.5 ml-auto"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                        <span>Update Status</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Status Changer & Resolution Notes */}
      <Modal
        isOpen={Boolean(selectedComplaint)}
        onClose={() => setSelectedComplaint(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">Update Complaint Status</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Ticket #{selectedComplaint?.id || ''} — {selectedComplaint?.title || ''}
            </div>
          </div>
        }
      >
        {selectedComplaint && (
          <form onSubmit={handleUpdateStatus} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200/80 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Reported by:</span>
                <span className="font-bold text-gray-900">
                  {selectedComplaint.residentName} (Unit {selectedComplaint.unitNumber})
                </span>
              </div>
              <div className="text-gray-700 font-normal pt-1 border-t border-gray-200">
                {selectedComplaint.description}
              </div>
            </div>

            <div>
              <label className="form-label">
                Resolution Status <span className="text-rose-500">*</span>
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ComplaintStatus)}
                className="input-base w-full cursor-pointer"
              >
                <option value="OPEN">OPEN (Awaiting Action)</option>
                <option value="IN_PROGRESS">IN PROGRESS (Work Assigned / Dispatched)</option>
                <option value="RESOLVED">RESOLVED (Issue Fixed / Verified)</option>
                <option value="CLOSED">CLOSED (Ticket Archived)</option>
              </select>
            </div>

            <div>
              <label className="form-label">Admin Resolution Notes / Technician Update</label>
              <textarea
                rows={3}
                value={adminNotesInput}
                onChange={(e) => setAdminNotesInput(e.target.value)}
                placeholder="e.g. Electrician dispatched, replaced fuse box, verified with resident."
                className="input-base w-full text-xs sm:text-sm resize-y"
              />
            </div>

            <div className="modal-footer pt-4">
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingStatus}
                className="btn-primary flex items-center gap-2"
              >
                {isUpdatingStatus ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Update Ticket</span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default ComplaintsPage;
