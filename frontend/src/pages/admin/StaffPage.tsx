import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  UserCheck,
  Plus,
  RefreshCw,
  Phone,
  Cpu,
  Filter,
  Edit2,
  Radio,
} from 'lucide-react';
import {
  societyAdminApi,
  CreateStaffPayload,
  UpdateStaffPayload,
} from '../../api/society-admin.api';
import type { Staff, StaffType, StaffStatus } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export const StaffPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Register Staff Modal & Form
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [registerForm, setRegisterForm] = useState<CreateStaffPayload>({
    name: '',
    phone: '',
    staffType: 'MAID',
    facePersonRef: '',
  });
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  // Edit / Pair M50 Face ID Modal & Form
  const [selectedStaffToEdit, setSelectedStaffToEdit] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState<UpdateStaffPayload>({
    name: '',
    phone: '',
    staffType: 'MAID',
    facePersonRef: '',
    status: 'ACTIVE',
  });
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Check URL query param ?action=register
  useEffect(() => {
    if (searchParams.get('action') === 'register') {
      setIsRegisterModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch staff
  const fetchStaff = useCallback(
    async (showRefreshing = false) => {
      if (!societyId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await societyAdminApi.getStaff(societyId);
        setStaffList(data);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load society domestic staff.';
        toastError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [societyId, toastError],
  );

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Handle Register Staff
  const handleRegisterStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !registerForm.name || !registerForm.phone) return;

    setIsRegistering(true);
    try {
      const created = await societyAdminApi.createStaff(societyId, {
        name: registerForm.name.trim(),
        phone: registerForm.phone.trim(),
        staffType: registerForm.staffType,
        facePersonRef: registerForm.facePersonRef?.trim() || undefined,
      });

      toastSuccess(`Staff member ${created.name} registered successfully.`);
      setIsRegisterModalOpen(false);
      setRegisterForm({
        name: '',
        phone: '',
        staffType: 'MAID',
        facePersonRef: '',
      });
      await fetchStaff(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to register staff member.';
      toastError(msg);
    } finally {
      setIsRegistering(false);
    }
  };

  // Open Edit / Pair M50 modal
  const openEditModal = (st: Staff) => {
    setSelectedStaffToEdit(st);
    setEditForm({
      name: st.name,
      phone: st.phone,
      staffType: st.staffType,
      facePersonRef: st.facePersonRef || '',
      status: st.status,
    });
  };

  // Handle Update Staff / M50 Face ID
  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !selectedStaffToEdit) return;

    setIsUpdating(true);
    try {
      const updated = await societyAdminApi.updateStaff(
        societyId,
        selectedStaffToEdit.id,
        {
          name: editForm.name?.trim(),
          phone: editForm.phone?.trim(),
          staffType: editForm.staffType,
          facePersonRef: editForm.facePersonRef?.trim() || undefined,
          status: editForm.status,
        },
      );

      toastSuccess(`Staff profile for ${updated.name} updated.`);
      setSelectedStaffToEdit(null);
      await fetchStaff(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update staff profile.';
      toastError(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((st) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        st.name.toLowerCase().includes(q) ||
        st.phone.includes(q) ||
        (st.facePersonRef && st.facePersonRef.toLowerCase().includes(q));

      const matchCategory =
        categoryFilter === 'ALL' || st.staffType === categoryFilter;

      const matchStatus =
        statusFilter === 'ALL' || st.status === statusFilter;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [staffList, searchQuery, categoryFilter, statusFilter]);

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
        title="Domestic Staff Management"
        subtitle="Register helpers, track daily attendance, and synchronize M50 facial recognition"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchStaff(true)}
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
              onClick={() => setIsRegisterModalOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Register Staff</span>
            </button>
          </div>
        }
      />

      {/* Staff Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Total Registered</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{staffList.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Active Helpers</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {staffList.filter((s) => s.status === 'ACTIVE').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">M50 Face Biometrics Paired</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            {staffList.filter((s) => Boolean(s.facePersonRef)).length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Maids & Cooks</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {staffList.filter((s) => ['MAID', 'COOK'].includes(s.staffType)).length}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by name, phone, or M50 Face ID..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input-base !py-1.5 !text-xs w-36 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="MAID">Maids</option>
              <option value="COOK">Cooks</option>
              <option value="DRIVER">Drivers</option>
              <option value="NANNY">Nannies</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-32 cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={5} rows={6} />
          </div>
        ) : staffList.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No domestic staff registered"
            description="Register maids, cooks, and drivers to allow automated M50 facial recognition entry."
            action={
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(true)}
                className="btn-primary text-xs"
              >
                Register Staff
              </button>
            }
          />
        ) : filteredStaff.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setCategoryFilter('ALL');
              setStatusFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Domestic Helper</th>
                  <th>Role / Category</th>
                  <th>Contact Phone</th>
                  <th>M50 Face Person ID</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-gray-50/80">
                    <td className="font-semibold text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#cd0447]/10 to-pink-100 text-[#cd0447] border border-[#cd0447]/20 flex items-center justify-center font-bold text-sm shrink-0">
                          {staff.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{staff.name}</div>
                          <div className="text-[11px] text-gray-400 font-mono">
                            ID: {staff.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{getStaffBadge(staff.staffType)}</td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-gray-700">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{staff.phone}</span>
                      </div>
                    </td>
                    <td>
                      {staff.facePersonRef ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Radio className="w-3 h-3 text-indigo-500 animate-pulse" />
                          <span>{staff.facePersonRef}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Not Paired</span>
                      )}
                    </td>
                    <td>
                      <Badge
                        variant={staff.status === 'ACTIVE' ? 'success' : 'neutral'}
                        size="sm"
                        dot
                      >
                        {staff.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(staff)}
                        className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1.5 ml-auto"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                        <span>{staff.facePersonRef ? 'Edit' : 'Pair M50'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Register Staff */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Register Domestic Helper</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Add a maid, cook, driver, or recurring caregiver to this society
            </div>
          </div>
        }
      >
        <form onSubmit={handleRegisterStaff} className="space-y-4">
          <div>
            <label className="form-label">
              Helper Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={registerForm.name}
              onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
              placeholder="e.g. Shanti Bai"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">
                Mobile Phone <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={registerForm.phone}
                onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                placeholder="9876543210"
                className="input-base w-full font-mono"
              />
            </div>
            <div>
              <label className="form-label">
                Category / Job <span className="text-rose-500">*</span>
              </label>
              <select
                value={registerForm.staffType}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, staffType: e.target.value as StaffType })
                }
                className="input-base w-full cursor-pointer"
              >
                <option value="MAID">Maid (Housekeeping)</option>
                <option value="COOK">Cook (Culinary)</option>
                <option value="DRIVER">Driver (Chauffeur)</option>
                <option value="NANNY">Nanny / Babysitter</option>
                <option value="OTHER">Other Recurring Helper</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-2">
            <label className="form-label text-indigo-900 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>M50 Face Biometrics User ID (Optional)</span>
            </label>
            <input
              type="text"
              value={registerForm.facePersonRef || ''}
              onChange={(e) =>
                setRegisterForm({ ...registerForm, facePersonRef: e.target.value })
              }
              placeholder="e.g. M50-USR-0892"
              className="input-base w-full font-mono text-xs bg-white"
            />
            <p className="text-[11px] text-indigo-700">
              Hardware ID provisioned on biometric terminal for automatic boom barrier opening.
            </p>
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRegistering || !registerForm.name || !registerForm.phone}
              className="btn-primary flex items-center gap-2"
            >
              {isRegistering ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <span>Register Staff</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Staff / Pair M50 Face ID */}
      <Modal
        isOpen={Boolean(selectedStaffToEdit)}
        onClose={() => setSelectedStaffToEdit(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">Update Staff: {selectedStaffToEdit?.name || ''}</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Update helper details or pair M50 facial recognition hardware ID
            </div>
          </div>
        }
      >
        <form onSubmit={handleUpdateStaff} className="space-y-4">
          <div>
            <label className="form-label">Helper Full Name</label>
            <input
              type="text"
              required
              value={editForm.name || ''}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="input-base w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                required
                value={editForm.phone || ''}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="input-base w-full font-mono"
              />
            </div>
            <div>
              <label className="form-label">Category</label>
              <select
                value={editForm.staffType}
                onChange={(e) =>
                  setEditForm({ ...editForm, staffType: e.target.value as StaffType })
                }
                className="input-base w-full cursor-pointer"
              >
                <option value="MAID">Maid</option>
                <option value="COOK">Cook</option>
                <option value="DRIVER">Driver</option>
                <option value="NANNY">Nanny</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Access Status</label>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value as StaffStatus })
              }
              className="input-base w-full cursor-pointer"
            >
              <option value="ACTIVE">ACTIVE (Authorized for Gate Entry)</option>
              <option value="INACTIVE">INACTIVE (Gate Access Suspended)</option>
            </select>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2">
            <label className="form-label text-indigo-900 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>Pair M50 Terminal Face ID</span>
            </label>
            <input
              type="text"
              value={editForm.facePersonRef || ''}
              onChange={(e) =>
                setEditForm({ ...editForm, facePersonRef: e.target.value })
              }
              placeholder="e.g. M50-USR-0892"
              className="input-base w-full font-mono text-xs bg-white"
            />
            <p className="text-[11px] text-indigo-700">
              Synchronizes face vector identification with all gate boom barriers.
            </p>
          </div>

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setSelectedStaffToEdit(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="btn-primary flex items-center gap-2"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StaffPage;
