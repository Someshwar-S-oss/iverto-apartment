import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  RefreshCw,
  Home,
  Mail,
  Phone,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import {
  societyAdminApi,
  CreateSocietyUserPayload,
  CreateSocietyUserResponse,
} from '../../api/society-admin.api';
import type { Unit } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';

export interface SocietyUserRosterItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  unitNumber?: string;
  buildingName?: string;
  isPrimary?: boolean;
  status?: string;
  createdAt?: string;
}

export const UsersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [units, setUnits] = useState<Unit[]>([]);
  const [roster, setRoster] = useState<SocietyUserRosterItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Provision User Modal & Form
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState<boolean>(false);
  const [formData, setFormData] = useState<CreateSocietyUserPayload>({
    name: '',
    email: '',
    phone: '',
    role: 'OWNER',
    unitId: '',
    isPrimary: true,
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Credentials Popup Modal
  const [createdCredentials, setCreatedCredentials] = useState<CreateSocietyUserResponse | null>(null);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Check URL query param ?action=provision
  useEffect(() => {
    if (searchParams.get('action') === 'provision') {
      setIsProvisionModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load Units and Roster data
  const loadData = useCallback(
    async (showRefreshing = false) => {
      if (!societyId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const unitsData = await societyAdminApi.getUnits(societyId);
        setUnits(unitsData);

        // Retrieve cached roster or seed sample directory with units
        const storageKey = `iverto_roster_${societyId}`;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          try {
            setRoster(JSON.parse(stored));
          } catch (e) {
            // fallback
          }
        } else {
          // Generate default roster entries based on society units
          const sampleRoster: SocietyUserRosterItem[] = [
            {
              id: 'usr-101',
              name: 'Dr. Arjun Mehta',
              email: 'arjun.mehta@example.com',
              phone: '9876543210',
              role: 'OWNER',
              unitNumber: unitsData[0]?.unitNumber || '101',
              buildingName: unitsData[0]?.buildingName || 'Tower A',
              isPrimary: true,
              status: 'ACTIVE',
              createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
            },
            {
              id: 'usr-102',
              name: 'Kavita Sen',
              email: 'kavita.sen@example.com',
              phone: '9822334455',
              role: 'TENANT',
              unitNumber: unitsData[1]?.unitNumber || '102',
              buildingName: unitsData[1]?.buildingName || 'Tower A',
              isPrimary: true,
              status: 'ACTIVE',
              createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
            },
            {
              id: 'usr-103',
              name: 'Ram Singh (Gate Captain)',
              email: 'ramsingh.guard@iverto.in',
              phone: '9811122233',
              role: 'GUARD_SUPERVISOR',
              status: 'ACTIVE',
              createdAt: new Date(Date.now() - 3600000 * 96).toISOString(),
            },
            {
              id: 'usr-104',
              name: 'Mohan Lal (Main Gate)',
              email: 'mohanlal.guard@iverto.in',
              phone: '9799887766',
              role: 'GUARD',
              status: 'ACTIVE',
              createdAt: new Date(Date.now() - 3600000 * 120).toISOString(),
            },
          ];
          setRoster(sampleRoster);
          localStorage.setItem(storageKey, JSON.stringify(sampleRoster));
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load directory.';
        toastError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [societyId, toastError],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isResidentRole = useMemo(() => {
    return ['OWNER', 'TENANT', 'FAMILY'].includes(formData.role);
  }, [formData.role]);

  // Handle Provision User submit
  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId) return;

    if (isResidentRole && !formData.unitId) {
      toastError('Please select a residential unit for this resident.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await societyAdminApi.createUser(societyId, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        role: formData.role,
        unitId: isResidentRole ? formData.unitId : undefined,
        isPrimary: isResidentRole ? formData.isPrimary : undefined,
      });

      // Find unit number if resident
      const assignedUnit = units.find((u) => u.id === formData.unitId);

      // Create new roster entry and save to localStorage
      const newEntry: SocietyUserRosterItem = {
        id: response.user.id,
        name: response.user.name,
        email: response.user.email,
        phone: response.user.phone,
        role: response.role,
        unitNumber: assignedUnit?.unitNumber,
        buildingName: assignedUnit?.buildingName || undefined,
        isPrimary: formData.isPrimary,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };

      const updatedRoster = [newEntry, ...roster];
      setRoster(updatedRoster);
      localStorage.setItem(`iverto_roster_${societyId}`, JSON.stringify(updatedRoster));

      // Show temporary credentials modal
      const tempPass = response.tempPassword || `${formData.phone.trim()}@iverto`;
      setCreatedCredentials({
        ...response,
        tempPassword: tempPass,
      });

      setIsProvisionModalOpen(false);
      setIsCredentialsModalOpen(true);
      toastSuccess(`User ${response.user.name} provisioned successfully.`);

      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        role: 'OWNER',
        unitId: '',
        isPrimary: true,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to provision user.';
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy Credentials to clipboard
  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const credText = `iverto Portal Access Credentials:\nEmail / Username: ${createdCredentials.user.email}\nTemporary Password: ${createdCredentials.tempPassword}\nPortal URL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(credText);
    setIsCopied(true);
    toastSuccess('Credentials copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2500);
  };

  // Filter roster
  const filteredRoster = useMemo(() => {
    return roster.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.phone.includes(q) ||
        (item.unitNumber && item.unitNumber.toLowerCase().includes(q));

      let matchRole = true;
      if (roleFilter === 'RESIDENTS') {
        matchRole = ['OWNER', 'TENANT', 'FAMILY'].includes(item.role);
      } else if (roleFilter === 'GUARDS') {
        matchRole = ['GUARD', 'GUARD_SUPERVISOR'].includes(item.role);
      } else if (roleFilter === 'ADMINS') {
        matchRole = item.role === 'SOCIETY_ADMIN';
      } else if (roleFilter !== 'ALL') {
        matchRole = item.role === roleFilter;
      }

      return matchQuery && matchRole;
    });
  }, [roster, searchQuery, roleFilter]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'OWNER':
        return <Badge variant="brand" size="sm">OWNER</Badge>;
      case 'TENANT':
        return <Badge variant="info" size="sm">TENANT</Badge>;
      case 'FAMILY':
        return <Badge variant="purple" size="sm">FAMILY</Badge>;
      case 'GUARD':
        return <Badge variant="warning" size="sm">GUARD</Badge>;
      case 'GUARD_SUPERVISOR':
        return <Badge variant="danger" size="sm">SUPERVISOR</Badge>;
      case 'SOCIETY_ADMIN':
        return <Badge variant="success" size="sm">ADMIN</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Users & Residents"
        subtitle="Manage resident members, guard personnel, and society administrators"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh roster"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsProvisionModalOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
              <span>Provision User</span>
            </button>
          </div>
        }
      />

      {/* Roster Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Total Users</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{roster.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Owners & Tenants</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {roster.filter((r) => ['OWNER', 'TENANT'].includes(r.role)).length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Security Guards</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {roster.filter((r) => ['GUARD', 'GUARD_SUPERVISOR'].includes(r.role)).length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Society Admins</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {roster.filter((r) => r.role === 'SOCIETY_ADMIN').length}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by name, email, phone, or unit..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-full sm:w-48 cursor-pointer"
          >
            <option value="ALL">All Roles ({roster.length})</option>
            <option value="RESIDENTS">Residents (Owners, Tenants, Family)</option>
            <option value="GUARDS">Security Guards & Supervisors</option>
            <option value="ADMINS">Society Admins</option>
            <option value="OWNER">Owners Only</option>
            <option value="TENANT">Tenants Only</option>
            <option value="FAMILY">Family Members Only</option>
          </select>
        </div>
      </div>

      {/* Users Roster Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={5} rows={6} />
          </div>
        ) : roster.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users provisioned"
            description="Provision your first resident, security guard, or admin."
            action={
              <button
                type="button"
                onClick={() => setIsProvisionModalOpen(true)}
                className="btn-primary text-xs"
              >
                Provision User
              </button>
            }
          />
        ) : filteredRoster.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setRoleFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User & Contacts</th>
                  <th>Role</th>
                  <th>Residence / Unit</th>
                  <th>Joined Date</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80">
                    <td className="font-semibold text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-gray-400" />
                              {item.email}
                            </span>
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-gray-400" />
                              {item.phone}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {getRoleBadge(item.role)}
                        {item.isPrimary && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            Primary
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {item.unitNumber ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                          <Home className="w-3.5 h-3.5 text-[#cd0447]" />
                          <span>Unit {item.unitNumber}</span>
                          {item.buildingName && (
                            <span className="text-gray-400 font-normal">
                              ({item.buildingName})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">Platform / Gate</span>
                      )}
                    </td>
                    <td className="text-xs text-gray-500">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="text-right">
                      <Badge variant="success" size="sm" dot>
                        ACTIVE
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Provision User */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">Provision New User</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Create an account and assign roles for a resident, guard, or admin
            </div>
          </div>
        }
      >
        <form onSubmit={handleProvisionUser} className="space-y-4">
          <div>
            <label className="form-label">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Rajesh Sharma"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="rajesh@example.com"
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="form-label">
                Mobile Phone <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="9876543210"
                className="input-base w-full font-mono"
              />
            </div>
          </div>

          <div>
            <label className="form-label">
              Role & Permissions <span className="text-rose-500">*</span>
            </label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as any,
                })
              }
              className="input-base w-full cursor-pointer"
            >
              <option value="OWNER">Owner (Flat Owner / Primary Resident)</option>
              <option value="TENANT">Tenant (Rental Resident)</option>
              <option value="FAMILY">Family Member (Co-resident)</option>
              <option value="GUARD">Security Guard (Gate Kiosk Access)</option>
              <option value="GUARD_SUPERVISOR">Security Supervisor</option>
              <option value="SOCIETY_ADMIN">Society Administrator</option>
            </select>
          </div>

          {/* Unit selector if resident */}
          {isResidentRole && (
            <div className="space-y-3 p-4 rounded-xl bg-pink-50/50 border border-pink-100">
              <div>
                <label className="form-label text-[#cd0447]">
                  Assign Residential Unit <span className="text-rose-500">*</span>
                </label>
                {units.length === 0 ? (
                  <p className="text-xs text-rose-600 font-medium">
                    No units available. Please create a building and unit in the Units tab first.
                  </p>
                ) : (
                  <select
                    required
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    className="input-base w-full cursor-pointer bg-white"
                  >
                    <option value="" disabled>
                      Select residential unit
                    </option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNumber} {u.buildingName ? `(${u.buildingName})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={formData.isPrimary}
                  onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                  className="rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447]"
                />
                <span>Designate as Primary Unit Member (receives priority gate calls)</span>
              </label>
            </div>
          )}

          <div className="modal-footer pt-4">
            <button
              type="button"
              onClick={() => setIsProvisionModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.email || !formData.phone}
              className="btn-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <span>Provision User</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Credentials Popup on Submit */}
      <Modal
        isOpen={isCredentialsModalOpen}
        onClose={() => setIsCredentialsModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">User Credentials Generated</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Share these temporary login credentials with the user
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-emerald-900 text-sm">Account Ready for Activation</p>
              <p className="mt-0.5 text-emerald-700">
                User will be prompted to reset their password upon initial login.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <span className="text-gray-500">Name:</span>
              <span className="font-bold text-gray-900">{createdCredentials?.user?.name}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <span className="text-gray-500">Email:</span>
              <span className="font-bold text-gray-900">{createdCredentials?.user?.email}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <span className="text-gray-500">Role:</span>
              <span className="font-bold text-[#cd0447]">{createdCredentials?.role}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Temporary Password:</span>
              <span className="font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                {createdCredentials?.tempPassword || `${createdCredentials?.user?.phone}@iverto`}
              </span>
            </div>
          </div>

          <div className="modal-footer pt-2">
            <button
              type="button"
              onClick={handleCopyCredentials}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Credentials</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
