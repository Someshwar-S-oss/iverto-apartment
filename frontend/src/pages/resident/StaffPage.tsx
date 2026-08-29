import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Plus,
  RefreshCw,
  Phone,
  Radio,
  Trash2,
  Bell,
  BellOff,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import { societyAdminApi } from '../../api/society-admin.api';
import type { Staff, StaffType } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const StaffPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'Flat';

  const [assignedStaff, setAssignedStaff] = useState<Staff[]>([]);
  const [societyStaffDirectory, setSocietyStaffDirectory] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Notifications state per helper (stored locally or synced)
  const [staffNotifications, setStaffNotifications] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(`iverto_staff_notify_${unitId}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Assign Staff Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState<string>('');
  const [selectedStaffToAssign, setSelectedStaffToAssign] = useState<Staff | null>(null);
  const [notifyOnEntry, setNotifyOnEntry] = useState<boolean>(true);
  const [isAssigning, setIsAssigning] = useState<boolean>(false);

  // Unassign Staff Confirmation Dialog
  const [staffToRemove, setStaffToRemove] = useState<Staff | null>(null);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  // Check URL query param ?action=assign
  useEffect(() => {
    if (searchParams.get('action') === 'assign') {
      setIsAssignModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch assigned staff for this unit
  const fetchAssignedStaff = useCallback(
    async (showRefreshing = false) => {
      if (!unitId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await residentApi.getStaff(unitId);
        setAssignedStaff(data || []);
      } catch (err: any) {
        console.error('Failed to fetch assigned household staff:', err);
        toastError('Failed to load household staff roster.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [unitId, toastError],
  );

  useEffect(() => {
    fetchAssignedStaff();
  }, [fetchAssignedStaff]);

  // Fetch society staff directory for the assignment modal
  const fetchSocietyStaff = useCallback(async () => {
    if (!societyId) return;
    try {
      const allStaff = await societyAdminApi.getStaff(societyId);
      setSocietyStaffDirectory(allStaff || []);
    } catch (err) {
      console.error('Failed to load society staff directory:', err);
    }
  }, [societyId]);

  useEffect(() => {
    if (isAssignModalOpen) {
      fetchSocietyStaff();
    }
  }, [isAssignModalOpen, fetchSocietyStaff]);

  // Toggle notification for a staff member
  const toggleNotification = (staffId: string) => {
    const current = staffNotifications[staffId] ?? true;
    const next = !current;
    const updated = { ...staffNotifications, [staffId]: next };
    setStaffNotifications(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`iverto_staff_notify_${unitId}`, JSON.stringify(updated));
    }
    toastSuccess(
      next
        ? 'Gate entry alerts enabled for helper.'
        : 'Gate entry alerts muted for helper.',
    );
  };

  // Handle Assign Staff to flat
  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !selectedStaffToAssign) return;

    setIsAssigning(true);
    try {
      await residentApi.assignStaff(unitId, selectedStaffToAssign.id, notifyOnEntry);
      toastSuccess(`${selectedStaffToAssign.name} assigned to Unit ${unitNumber}.`);

      // Update local notification setting
      const updated = {
        ...staffNotifications,
        [selectedStaffToAssign.id]: notifyOnEntry,
      };
      setStaffNotifications(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`iverto_staff_notify_${unitId}`, JSON.stringify(updated));
      }

      setIsAssignModalOpen(false);
      setSelectedStaffToAssign(null);
      await fetchAssignedStaff(true);
    } catch (err: any) {
      console.error('Failed to assign staff:', err);
      toastError(err.response?.data?.message || 'Failed to assign staff to unit.');
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle Unassign Staff
  const handleConfirmRemove = async () => {
    if (!unitId || !staffToRemove) return;

    setIsRemoving(true);
    try {
      await residentApi.unassignStaff(unitId, staffToRemove.id);
      toastSuccess(`${staffToRemove.name} removed from Unit ${unitNumber}.`);

      setAssignedStaff((prev) => prev.filter((s) => s.id !== staffToRemove.id));
      setStaffToRemove(null);
    } catch (err: any) {
      console.error('Failed to remove staff:', err);
      toastError(err.response?.data?.message || 'Failed to unassign staff from flat.');
    } finally {
      setIsRemoving(false);
    }
  };

  // Filter assigned staff
  const filteredStaff = useMemo(() => {
    return assignedStaff.filter((st) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        st.name.toLowerCase().includes(q) ||
        st.phone.includes(q) ||
        (st.staffType && st.staffType.toLowerCase().includes(q));

      const matchCategory =
        categoryFilter === 'ALL' || st.staffType === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [assignedStaff, searchQuery, categoryFilter]);

  // Filter available society staff for assignment
  const availableToAssign = useMemo(() => {
    const assignedIds = new Set(assignedStaff.map((s) => s.id));
    const q = assignSearchQuery.toLowerCase().trim();

    return societyStaffDirectory
      .filter((s) => !assignedIds.has(s.id))
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.staffType.toLowerCase().includes(q)
        );
      });
  }, [societyStaffDirectory, assignedStaff, assignSearchQuery]);

  const getStaffBadge = (type: StaffType) => {
    switch (type) {
      case 'MAID':
        return <Badge variant="brand" size="sm">MAID</Badge>;
      case 'COOK':
        return <Badge variant="warning" size="sm">COOK</Badge>;
      case 'DRIVER':
        return <Badge variant="info" size="sm">DRIVER</Badge>;
      case 'NANNY':
        return <Badge variant="purple" size="sm">NANNY</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Domestic Household Staff"
        subtitle={`Manage maids, cooks, drivers, and nannies assigned to Flat ${unitNumber}`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchAssignedStaff(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh staff roster"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Assign Staff to Flat</span>
            </button>
          </div>
        }
      />

      {/* Staff Summary Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Assigned Helpers</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{assignedStaff.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Currently in Society</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {assignedStaff.filter((s) => s.status === 'ACTIVE').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">M50 Biometric Synced</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            {assignedStaff.filter((s) => Boolean(s.facePersonRef)).length}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by helper name or role..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-full sm:w-40 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="MAID">Maid (Housekeeping)</option>
            <option value="COOK">Cook (Culinary)</option>
            <option value="DRIVER">Driver</option>
            <option value="NANNY">Nanny</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* Assigned Staff Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <TableSkeleton columns={4} rows={3} />
        ) : assignedStaff.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No domestic staff assigned to your flat"
            description="Add your maid, cook, or driver from the verified society directory to receive instant arrival alerts."
            action={
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(true)}
                className="btn-primary text-xs"
              >
                Assign Staff to Flat
              </button>
            }
          />
        ) : filteredStaff.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setCategoryFilter('ALL');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredStaff.map((staff) => {
              const isNotified = staffNotifications[staff.id] ?? true;
              const isPresent = staff.status === 'ACTIVE';

              return (
                <div
                  key={staff.id}
                  className="card p-5 border border-gray-200 hover:border-pink-300 hover:shadow-md transition-all flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-100 to-rose-100 text-[#cd0447] border border-pink-200 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                        {staff.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base text-gray-900 truncate">
                          {staff.name}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {getStaffBadge(staff.staffType)}
                        </div>
                      </div>
                    </div>

                    {/* Real-time Presence Badge */}
                    <Badge
                      variant={isPresent ? 'success' : 'neutral'}
                      size="sm"
                      dot
                    >
                      {isPresent ? 'IN SOCIETY' : 'AWAY'}
                    </Badge>
                  </div>

                  {/* Phone & Biometric info */}
                  <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        Phone
                      </span>
                      <span className="font-mono font-medium text-gray-800">{staff.phone}</span>
                    </div>

                    <div className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Radio className="w-3.5 h-3.5 text-indigo-500" />
                        M50 Face Scan
                      </span>
                      <span className="font-mono text-xs text-indigo-700">
                        {staff.facePersonRef || 'Enrolled'}
                      </span>
                    </div>
                  </div>

                  {/* Notification Toggle & Remove Button */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => toggleNotification(staff.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isNotified
                          ? 'bg-pink-50 text-[#cd0447] border border-pink-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                      title={isNotified ? 'Arrival alerts enabled' : 'Arrival alerts muted'}
                    >
                      {isNotified ? (
                        <>
                          <Bell className="w-3.5 h-3.5" />
                          <span>Alerts ON</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-3.5 h-3.5" />
                          <span>Alerts OFF</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStaffToRemove(staff)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Unassign staff from flat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Assign Staff to Flat */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setSelectedStaffToAssign(null);
        }}
        title={
          <div>
            <div className="font-bold text-gray-900">Assign Staff to Flat {unitNumber}</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Select verified domestic staff registered in the society directory
            </div>
          </div>
        }
        size="md"
      >
        <form onSubmit={handleAssignStaff} className="space-y-4">
          <div>
            <label className="form-label">Search Society Staff Directory</label>
            <div className="relative">
              <input
                type="text"
                value={assignSearchQuery}
                onChange={(e) => setAssignSearchQuery(e.target.value)}
                placeholder="Search helper name or category..."
                className="input-base w-full pl-9"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded-xl p-2 bg-gray-50/50">
            {availableToAssign.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">
                {assignSearchQuery
                  ? 'No matching helpers found.'
                  : 'All society registered helpers are already assigned to this flat.'}
              </div>
            ) : (
              availableToAssign.map((s) => {
                const isSelected = selectedStaffToAssign?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStaffToAssign(s)}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-pink-50/80 border-[#cd0447] shadow-xs'
                        : 'bg-white border-gray-200 hover:border-pink-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-pink-100 text-[#cd0447] font-bold text-xs flex items-center justify-center">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{s.phone}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStaffBadge(s.staffType)}
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-[#cd0447]" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Notification Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnEntry}
                onChange={(e) => setNotifyOnEntry(e.target.checked)}
                className="rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447]"
              />
              <span>Send push alert whenever this helper checks in at gate</span>
            </label>
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => {
                setIsAssignModalOpen(false);
                setSelectedStaffToAssign(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedStaffToAssign}
              className="btn-primary flex items-center gap-2"
            >
              {isAssigning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : (
                <span>Assign Staff</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog: Unassign Staff */}
      <ConfirmDialog
        isOpen={Boolean(staffToRemove)}
        title="Remove Staff Assignment"
        message={`Are you sure you want to unassign ${staffToRemove?.name || 'this helper'} from Flat ${unitNumber}? They will no longer be listed under your household.`}
        confirmLabel="Remove Staff"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isRemoving}
        onConfirm={handleConfirmRemove}
        onCancel={() => setStaffToRemove(null)}
      />
    </div>
  );
};

export default StaffPage;
