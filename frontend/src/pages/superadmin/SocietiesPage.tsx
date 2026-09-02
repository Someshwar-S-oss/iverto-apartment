import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  Plus,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  Power,
  Clock,
  MapPin,
  Globe,
  UserCheck,
  Mail,
  Phone,
  Key,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { superadminApi, CreateSocietyPayload, CreateSocietyResponse } from '../../api/superadmin.api';
import type { Society } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const SOCIETIES_KEY = 'superadmin/societies';

type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export const SocietiesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Modals state
  const [isOnboardOpen, setIsOnboardOpen] = useState<boolean>(false);
  const [createdSocietyData, setCreatedSocietyData] = useState<CreateSocietyResponse | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Status toggle confirm dialog
  const [societyToToggle, setSocietyToToggle] = useState<Society | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false);

  // Details modal
  const [selectedSociety, setSelectedSociety] = useState<Society | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateSocietyPayload>({
    name: '',
    address: '',
    timezone: 'Asia/Kolkata',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Check URL query param ?action=onboard
  useEffect(() => {
    if (searchParams.get('action') === 'onboard') {
      setIsOnboardOpen(true);
      // Remove query param after opening to keep URL clean
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const {
    data: societiesData,
    isLoading,
    isRefreshing,
    refetch,
  } = useCachedFetch<Society[]>(
    SOCIETIES_KEY,
    () => superadminApi.getSocieties().then((data) => data || []),
  );

  const societies = useMemo(() => societiesData ?? [], [societiesData]);

  // Form Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Society Name is required';
    }
    if (!formData.adminName.trim()) {
      errors.adminName = 'Master Admin Name is required';
    }
    if (!formData.adminEmail.trim()) {
      errors.adminEmail = 'Admin Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail.trim())) {
      errors.adminEmail = 'Please enter a valid email address';
    }
    if (!formData.adminPhone.trim()) {
      errors.adminPhone = 'Admin Phone is required';
    } else if (!/^\+?[0-9]{7,15}$/.test(formData.adminPhone.trim())) {
      errors.adminPhone = 'Please enter a valid phone number (7-15 digits)';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const res = await superadminApi.createSociety({
        name: formData.name.trim(),
        address: formData.address?.trim() || undefined,
        timezone: formData.timezone || 'Asia/Kolkata',
        adminName: formData.adminName.trim(),
        adminEmail: formData.adminEmail.trim().toLowerCase(),
        adminPhone: formData.adminPhone.trim(),
      });

      // Reset form
      setFormData({
        name: '',
        address: '',
        timezone: 'Asia/Kolkata',
        adminName: '',
        adminEmail: '',
        adminPhone: '',
      });
      setFormErrors({});
      setIsOnboardOpen(false);

      // Show success modal with master admin credentials
      setCreatedSocietyData(res);
      setIsSuccessModalOpen(true);
      toastSuccess(`Society "${res.society.name}" onboarded successfully!`);

      // Refresh table
      await refetch(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to onboard society. Please check your inputs.';
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status toggle handler (Activate / Suspend)
  const handleToggleStatus = async () => {
    if (!societyToToggle) return;

    const newStatus = societyToToggle.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setIsTogglingStatus(true);

    try {
      await superadminApi.updateSocietyStatus(societyToToggle.id, newStatus);
      toastSuccess(
        `Society "${societyToToggle.name}" has been ${
          newStatus === 'ACTIVE' ? 'activated' : 'suspended'
        }.`,
      );
      setSocietyToToggle(null);
      await refetch(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update society status.';
      toastError(msg);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdSocietyData) return;

    const email = createdSocietyData.adminUser.email;
    const tempPassword =
      createdSocietyData.adminUser.tempPassword ||
      `${createdSocietyData.adminUser.phone}@iverto`;

    const credentialsText = `iverto Master Admin Credentials:
Society: ${createdSocietyData.society.name}
Email / Login: ${email}
Phone: ${createdSocietyData.adminUser.phone}
Temporary Password: ${tempPassword}
Login URL: ${window.location.origin}/login`;

    navigator.clipboard.writeText(credentialsText).then(() => {
      setIsCopied(true);
      toastSuccess('Credentials copied to clipboard!');
      setTimeout(() => setIsCopied(false), 3000);
    });
  };

  // Filtered Societies
  const filteredSocieties = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return societies.filter((soc) => {
      // Status filter
      if (statusFilter !== 'ALL' && soc.status !== statusFilter) {
        return false;
      }

      // Search query
      if (q) {
        const matchName = soc.name.toLowerCase().includes(q);
        const matchAddress = soc.address ? soc.address.toLowerCase().includes(q) : false;
        const matchId = soc.id.toLowerCase().includes(q);
        return matchName || matchAddress || matchId;
      }

      return true;
    });
  }, [societies, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Client Societies"
        subtitle="Manage gated communities, provision master administrators, and configure tenant settings"
        actions={
          <>
            <button
              type="button"
              onClick={() => void refetch(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh societies"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOnboardOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Onboard Society</span>
            </button>
          </>
        }
        filters={
          <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="w-full sm:w-80">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by name, address, or ID..."
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              {(['ALL', 'ACTIVE', 'SUSPENDED'] as StatusFilter[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    statusFilter === st
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {st === 'ALL' ? 'All Societies' : st}
                  {st === 'ALL' && ` (${societies.length})`}
                  {st === 'ACTIVE' &&
                    ` (${societies.filter((s) => s.status === 'ACTIVE').length})`}
                  {st === 'SUSPENDED' &&
                    ` (${societies.filter((s) => s.status === 'SUSPENDED').length})`}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Main Data Table Card */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={6} rows={6} />
          </div>
        ) : societies.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={Building2}
              title="No societies onboarded yet"
              description="Register residential complexes and gated societies into the iverto multi-tenant architecture."
              action={
                <button
                  type="button"
                  onClick={() => setIsOnboardOpen(true)}
                  className="btn-primary text-xs !py-2 !px-4"
                >
                  <Plus className="w-4 h-4" />
                  <span>Onboard First Society</span>
                </button>
              }
            />
          </div>
        ) : filteredSocieties.length === 0 ? (
          <div className="p-12">
            <NoResultsState
              query={searchQuery}
              onClear={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Society & Tenant ID</th>
                  <th>Address & Location</th>
                  <th>Timezone</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSocieties.map((soc) => (
                  <tr key={soc.id} className="hover:bg-gray-50/80 transition-colors">
                    {/* Name & ID */}
                    <td className="font-semibold text-gray-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-pink-50 text-[#cd0447] border border-pink-100 flex items-center justify-center shrink-0 shadow-xs">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 hover:text-[#cd0447] transition-colors cursor-pointer" onClick={() => setSelectedSociety(soc)}>
                            {soc.name}
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono flex items-center gap-1 mt-0.5">
                            <span>ID:</span>
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">
                              {soc.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Address */}
                    <td className="text-xs text-gray-600 max-w-[240px]">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <span className="truncate">{soc.address || 'Address not specified'}</span>
                      </div>
                    </td>

                    {/* Timezone */}
                    <td className="text-xs text-gray-600 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-gray-400" />
                        <span>{soc.timezone || 'Asia/Kolkata'}</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td>
                      <Badge
                        variant={soc.status === 'ACTIVE' ? 'success' : 'danger'}
                        size="sm"
                        dot
                      >
                        {soc.status}
                      </Badge>
                    </td>

                    {/* Created Date */}
                    <td className="text-xs text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          {soc.createdAt
                            ? new Date(soc.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* View Details Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedSociety(soc)}
                          className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1"
                          title="View Society Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                          <span>Details</span>
                        </button>

                        {/* Toggle Status Button */}
                        <button
                          type="button"
                          onClick={() => setSocietyToToggle(soc)}
                          className={`!text-xs !py-1 !px-2.5 inline-flex items-center gap-1 rounded-full font-medium transition-all ${
                            soc.status === 'ACTIVE'
                              ? 'text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer'
                              : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer'
                          }`}
                          title={soc.status === 'ACTIVE' ? 'Suspend Society' : 'Activate Society'}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{soc.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Onboard Society Modal */}
      <Modal
        isOpen={isOnboardOpen}
        onClose={() => {
          if (!isSubmitting) {
            setIsOnboardOpen(false);
            setFormErrors({});
          }
        }}
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-pink-100 text-[#cd0447] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <span>Onboard New Society</span>
          </div>
        }
        size="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-5" noValidate>
          {/* Section 1: Society Information */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              1. Gated Community Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="field-label field-required">Society Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                  }}
                  placeholder="e.g. Prestige Green Meadows"
                  disabled={isSubmitting}
                  className={`field ${formErrors.name ? 'field-invalid' : ''}`}
                />
                {formErrors.name && <p className="field-error">{formErrors.name}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">Address / Location</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 104 Sarjapur Main Road, Bellandur, Bengaluru"
                  disabled={isSubmitting}
                  className="field"
                />
              </div>

              <div>
                <label className="field-label">Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  disabled={isSubmitting}
                  className="field font-mono text-xs"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              2. Initial Master Administrator
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              The platform will automatically provision a Master Administrator user account and generate temporary access credentials.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="field-label field-required">Master Admin Full Name</label>
                <div className="relative">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.adminName}
                    onChange={(e) => {
                      setFormData({ ...formData, adminName: e.target.value });
                      if (formErrors.adminName) setFormErrors({ ...formErrors, adminName: '' });
                    }}
                    placeholder="e.g. Rajesh Kumar"
                    disabled={isSubmitting}
                    className={`field !pl-10 ${formErrors.adminName ? 'field-invalid' : ''}`}
                  />
                </div>
                {formErrors.adminName && <p className="field-error">{formErrors.adminName}</p>}
              </div>

              <div>
                <label className="field-label field-required">Admin Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => {
                      setFormData({ ...formData, adminEmail: e.target.value });
                      if (formErrors.adminEmail) setFormErrors({ ...formErrors, adminEmail: '' });
                    }}
                    placeholder="admin@society.org"
                    disabled={isSubmitting}
                    className={`field !pl-10 ${formErrors.adminEmail ? 'field-invalid' : ''}`}
                  />
                </div>
                {formErrors.adminEmail && <p className="field-error">{formErrors.adminEmail}</p>}
              </div>

              <div>
                <label className="field-label field-required">Admin Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={formData.adminPhone}
                    onChange={(e) => {
                      setFormData({ ...formData, adminPhone: e.target.value });
                      if (formErrors.adminPhone) setFormErrors({ ...formErrors, adminPhone: '' });
                    }}
                    placeholder="+919876543210"
                    disabled={isSubmitting}
                    className={`field !pl-10 ${formErrors.adminPhone ? 'field-invalid' : ''}`}
                  />
                </div>
                {formErrors.adminPhone && <p className="field-error">{formErrors.adminPhone}</p>}
              </div>
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsOnboardOpen(false)}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Provisioning Society...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Complete Onboarding</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Onboarding Success Modal with Master Admin Credentials */}
      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-gray-900 font-bold">Society Provisioned Successfully!</span>
          </div>
        }
        size="md"
      >
        {createdSocietyData && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600 leading-relaxed">
              The tenant gated community <strong className="text-gray-900">{createdSocietyData.society.name}</strong> has been initialized in the system.
            </p>

            {/* Generated Credentials Box */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#cd0447]" />
                  Master Admin Credentials
                </span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Must Change Password on First Login
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Admin Name:</span>
                  <span className="font-semibold text-gray-900">{createdSocietyData.adminUser.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Login Email:</span>
                  <span className="font-mono font-semibold text-gray-900">{createdSocietyData.adminUser.email}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Phone:</span>
                  <span className="font-mono font-semibold text-gray-900">{createdSocietyData.adminUser.phone}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Temporary Password:</span>
                  <span className="font-mono font-bold text-[#cd0447] bg-pink-50 px-2 py-0.5 rounded border border-pink-200">
                    {createdSocietyData.adminUser.tempPassword ||
                      `${createdSocietyData.adminUser.phone}@iverto`}
                  </span>
                </div>
              </div>
            </div>

            {/* Copy Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="btn-primary w-full sm:flex-1 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Credentials Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Master Admin Credentials</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsSuccessModalOpen(false)}
                className="btn-secondary w-full sm:w-auto py-2.5 text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Society Details Modal */}
      <Modal
        isOpen={!!selectedSociety}
        onClose={() => setSelectedSociety(null)}
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-pink-50 text-[#cd0447] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <span>Society Configuration Details</span>
          </div>
        }
        size="md"
      >
        {selectedSociety && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-900">{selectedSociety.name}</span>
                <Badge
                  variant={selectedSociety.status === 'ACTIVE' ? 'success' : 'danger'}
                  size="sm"
                  dot
                >
                  {selectedSociety.status}
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Tenant ID:</span>
                  <span className="font-mono text-gray-800">{selectedSociety.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Address:</span>
                  <span className="text-gray-800 text-right max-w-[260px]">{selectedSociety.address || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Timezone:</span>
                  <span className="font-mono text-gray-800">{selectedSociety.timezone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-200/60">
                  <span className="text-gray-500">Onboarded At:</span>
                  <span className="text-gray-800">
                    {selectedSociety.createdAt
                      ? new Date(selectedSociety.createdAt).toLocaleString()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Last Modified:</span>
                  <span className="text-gray-800">
                    {selectedSociety.updatedAt
                      ? new Date(selectedSociety.updatedAt).toLocaleString()
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setSocietyToToggle(selectedSociety);
                  setSelectedSociety(null);
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  selectedSociety.status === 'ACTIVE'
                    ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {selectedSociety.status === 'ACTIVE' ? 'Suspend Society' : 'Activate Society'}
              </button>

              <button
                type="button"
                onClick={() => setSelectedSociety(null)}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Status Toggle Dialog */}
      <ConfirmDialog
        isOpen={!!societyToToggle}
        title={
          societyToToggle?.status === 'ACTIVE'
            ? 'Suspend Tenant Society?'
            : 'Activate Tenant Society?'
        }
        message={
          societyToToggle?.status === 'ACTIVE'
            ? `Suspending "${societyToToggle?.name}" will restrict administrative actions and lock guard kiosk terminals until re-activated.`
            : `Re-activating "${societyToToggle?.name}" will restore full platform access for residents, guards, and society administrators.`
        }
        confirmLabel={
          societyToToggle?.status === 'ACTIVE' ? 'Suspend Society' : 'Activate Society'
        }
        variant={societyToToggle?.status === 'ACTIVE' ? 'danger' : 'primary'}
        isLoading={isTogglingStatus}
        onConfirm={handleToggleStatus}
        onCancel={() => setSocietyToToggle(null)}
      />
    </div>
  );
};

export default SocietiesPage;
