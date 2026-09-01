import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  RefreshCw,
  Phone,
  Radio,
  Bell,
  BellOff,
  ShieldCheck,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import type { Staff, StaffType } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const StaffPage: React.FC = () => {
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'Flat';

  const [assignedStaff, setAssignedStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Notifications state per helper — a purely local viewing preference, not a backend
  // permission. Assigning/unassigning staff to a flat is a site-admin-only action (see
  // society-admin.controller.ts); residents can view their household roster but not
  // change who's on it.
  const [staffNotifications, setStaffNotifications] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(`iverto_staff_notify_${unitId}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

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
        subtitle={`Maids, cooks, drivers, and nannies assigned to Flat ${unitNumber}`}
        actions={
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
        }
      />

      {/* Info banner: assignment is admin-only */}
      <div className="card-static p-4 bg-indigo-50/60 border border-indigo-100 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-900">
          To add or remove a helper from your flat, contact your society's site admin —
          staff assignment is managed centrally to keep the M50 biometric roster accurate.
        </p>
      </div>

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
            description="Ask your society's site admin to assign your maid, cook, or driver from the verified society directory."
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

                  {/* Notification Toggle (local viewing preference only) */}
                  <div className="flex items-center pt-3 border-t border-gray-100">
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffPage;
