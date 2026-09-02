import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Cpu,
  Plus,
  Building2,
  Key,
  Clock,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Loader2,
  DoorOpen,
} from 'lucide-react';
import { superadminApi, ProvisionDevicePayload } from '../../api/superadmin.api';
import type { Device, DeviceVendor, Gate, Society } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const DEVICES_KEY = 'superadmin/devices';
const SOCIETIES_KEY = 'superadmin/societies';

type DeviceStatusFilter = 'ALL' | 'ONLINE' | 'OFFLINE' | 'DEGRADED';

const VENDORS: { value: DeviceVendor; label: string; badgeVariant: BadgeVariant }[] = [
  { value: 'M50', label: 'M50 SpeedFace (Biometric)', badgeVariant: 'brand' },
  { value: 'ZKTECO', label: 'ZKTeco Terminal', badgeVariant: 'info' },
  { value: 'ESSL', label: 'eSSL Gate Controller', badgeVariant: 'purple' },
  { value: 'MATRIX', label: 'Matrix Cosec Bridge', badgeVariant: 'warning' },
  { value: 'OTHER', label: 'Other Hardware', badgeVariant: 'neutral' },
];

/**
 * Evaluates whether a device is currently active/online based on status & last heartbeat.
 * A device is considered online if status is ONLINE or lastSeenAt is within 5 minutes.
 */
export const checkDeviceOnline = (device: Device): { isOnline: boolean; label: string } => {
  if (!device.lastSeenAt) {
    const isOnline = device.status === 'ONLINE';
    return {
      isOnline,
      label: isOnline ? 'Online' : 'Never Seen',
    };
  }

  const lastSeenMs = new Date(device.lastSeenAt).getTime();
  const diffMinutes = (Date.now() - lastSeenMs) / (1000 * 60);

  if (device.status === 'ONLINE' || diffMinutes <= 5) {
    return { isOnline: true, label: 'Online (< 5m)' };
  }

  if (device.status === 'DEGRADED') {
    return { isOnline: false, label: 'Degraded' };
  }

  return { isOnline: false, label: 'Offline' };
};

export const DevicesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();

  const [societyGates, setSocietyGates] = useState<Gate[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>('ALL');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('ALL');

  // Modal State
  const [isProvisionOpen, setIsProvisionOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedSerial, setCopiedSerial] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<ProvisionDevicePayload>({
    serialNo: '',
    vendor: 'M50',
    societyId: '',
    gateId: '',
    name: '',
    authToken: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Check URL query param ?action=provision
  useEffect(() => {
    if (searchParams.get('action') === 'provision') {
      setIsProvisionOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const {
    data: devicesData,
    isLoading: isLoadingDevices,
    isRefreshing: isRefreshingDevices,
    refetch: refetchDevices,
  } = useCachedFetch<Device[]>(
    DEVICES_KEY,
    () => superadminApi.getDevices().then((data) => data || []),
  );

  const {
    data: societiesData,
    isLoading: isLoadingSocieties,
    isRefreshing: isRefreshingSocieties,
    refetch: refetchSocieties,
  } = useCachedFetch<Society[]>(
    SOCIETIES_KEY,
    () => superadminApi.getSocieties().then((data) => data || []),
  );

  const devices = useMemo(() => devicesData ?? [], [devicesData]);
  const societies = useMemo(() => societiesData ?? [], [societiesData]);

  const isLoading = isLoadingDevices || isLoadingSocieties;
  const isRefreshing = isRefreshingDevices || isRefreshingSocieties;

  const refresh = useCallback(
    () => Promise.all([refetchDevices(true), refetchSocieties(true)]),
    [refetchDevices, refetchSocieties],
  );

  // Default first society in form if not selected
  useEffect(() => {
    if (societies.length > 0 && !formData.societyId) {
      setFormData((prev) => ({
        ...prev,
        societyId: prev.societyId || societies[0].id,
      }));
    }
  }, [societies, formData.societyId]);

  // Refresh the gate picker whenever the target society changes
  useEffect(() => {
    if (!formData.societyId) {
      setSocietyGates([]);
      return;
    }
    let cancelled = false;
    superadminApi
      .getGatesForSociety(formData.societyId)
      .then((data) => {
        if (!cancelled) setSocietyGates(data || []);
      })
      .catch(() => {
        if (!cancelled) setSocietyGates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.societyId]);

  // Map societyId to Society name
  const societyMap = useMemo(() => {
    const map = new Map<string, Society>();
    societies.forEach((s) => map.set(s.id, s));
    return map;
  }, [societies]);

  // Generate random M50 serial helper
  const handleGenerateSerial = () => {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const vendorPrefix = formData.vendor === 'M50' ? 'M50' : formData.vendor;
    const generated = `${vendorPrefix}-${randomDigits}`;
    setFormData((prev) => ({ ...prev, serialNo: generated }));
    if (formErrors.serialNo) {
      setFormErrors((prev) => ({ ...prev, serialNo: '' }));
    }
  };

  // Generate random Secret Token helper
  const handleGenerateSecret = () => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const secret = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    setFormData((prev) => ({ ...prev, authToken: `sec_${secret}` }));
  };

  // Form Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.serialNo.trim()) {
      errors.serialNo = 'Serial number / MAC address is required';
    }
    if (!formData.societyId) {
      errors.societyId = 'Target society must be selected';
    }
    if (!formData.name?.trim()) {
      errors.name = 'Terminal display label is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const provisioned = await superadminApi.provisionDevice({
        serialNo: formData.serialNo.trim(),
        vendor: formData.vendor,
        societyId: formData.societyId,
        gateId: formData.gateId || undefined,
        name: formData.name?.trim() || undefined,
        authToken: formData.authToken?.trim() || undefined,
      });

      toastSuccess(`Terminal ${provisioned.serialNo} provisioned successfully!`);

      // Reset form
      setFormData({
        serialNo: '',
        vendor: 'M50',
        societyId: societies[0]?.id || '',
        gateId: '',
        name: '',
        authToken: '',
      });
      setFormErrors({});
      setIsProvisionOpen(false);

      // Refresh list
      await refresh();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to provision terminal. Please check inputs.';
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySerial = (serial: string) => {
    navigator.clipboard.writeText(serial).then(() => {
      setCopiedSerial(serial);
      toastSuccess(`Copied serial ${serial} to clipboard`);
      setTimeout(() => setCopiedSerial(null), 2500);
    });
  };

  // Filtered devices
  const filteredDevices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return devices.filter((dev) => {
      // Online/Offline status filter
      if (statusFilter !== 'ALL') {
        const { isOnline } = checkDeviceOnline(dev);
        if (statusFilter === 'ONLINE' && !isOnline) return false;
        if (statusFilter === 'OFFLINE' && isOnline) return false;
        if (statusFilter === 'DEGRADED' && dev.status !== 'DEGRADED') return false;
      }

      // Vendor Filter
      if (selectedVendorFilter !== 'ALL' && dev.vendor !== selectedVendorFilter) {
        return false;
      }

      // Search Query
      if (q) {
        const matchSerial = dev.serialNo.toLowerCase().includes(q);
        const matchVendor = dev.vendor.toLowerCase().includes(q);
        const matchName = dev.name ? dev.name.toLowerCase().includes(q) : false;
        const matchGate = dev.gateName ? dev.gateName.toLowerCase().includes(q) : false;
        const soc = societyMap.get(dev.societyId);
        const matchSocName = soc ? soc.name.toLowerCase().includes(q) : false;
        const matchSocId = dev.societyId.toLowerCase().includes(q);

        return (
          matchSerial ||
          matchVendor ||
          matchName ||
          matchGate ||
          matchSocName ||
          matchSocId
        );
      }

      return true;
    });
  }, [devices, searchQuery, statusFilter, selectedVendorFilter, societyMap]);

  return (
    <div className="space-y-6 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Global Biometric Terminals"
        subtitle="M50, ZKTeco, and eSSL hardware fleet management across all client societies"
        actions={
          <>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh hardware status"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsProvisionOpen(true)}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Provision Terminal</span>
            </button>
          </>
        }
        filters={
          <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="w-full sm:w-80">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by serial, vendor, gate, society..."
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Vendor Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Vendor:</span>
                <select
                  value={selectedVendorFilter}
                  onChange={(e) => setSelectedVendorFilter(e.target.value)}
                  className="field text-xs !py-1.5 !px-2.5 w-auto"
                >
                  <option value="ALL">All Vendors</option>
                  <option value="M50">M50 Biometric</option>
                  <option value="ZKTECO">ZKTeco</option>
                  <option value="ESSL">eSSL</option>
                  <option value="MATRIX">Matrix</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl shrink-0">
                {(['ALL', 'ONLINE', 'OFFLINE'] as DeviceStatusFilter[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                      statusFilter === st
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {st === 'ALL' ? 'All Status' : st}
                    {st === 'ALL' && ` (${devices.length})`}
                    {st === 'ONLINE' &&
                      ` (${devices.filter((d) => checkDeviceOnline(d).isOnline).length})`}
                    {st === 'OFFLINE' &&
                      ` (${devices.filter((d) => !checkDeviceOnline(d).isOnline).length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        }
      />

      {/* Main Data Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={6} rows={6} />
          </div>
        ) : devices.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={Cpu}
              title="No biometric terminals provisioned"
              description="Register M50 SpeedFace biometric devices or gate controllers into your platform fleet."
              action={
                <button
                  type="button"
                  onClick={() => setIsProvisionOpen(true)}
                  className="btn-primary text-xs !py-2 !px-4"
                >
                  <Plus className="w-4 h-4" />
                  <span>Provision First Terminal</span>
                </button>
              }
            />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-12">
            <NoResultsState
              query={searchQuery}
              onClear={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setSelectedVendorFilter('ALL');
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Terminal Serial Number</th>
                  <th>Vendor & Model</th>
                  <th>Gate Assignment</th>
                  <th>Assigned Society</th>
                  <th>Telemetry Status</th>
                  <th>Last Heartbeat</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => {
                  const { isOnline, label: statusLabel } = checkDeviceOnline(device);
                  const soc = societyMap.get(device.societyId);
                  const vendorConfig = VENDORS.find((v) => v.value === device.vendor);

                  return (
                    <tr key={device.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Serial Number */}
                      <td className="font-semibold text-gray-900">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0 shadow-xs">
                            <Cpu className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold font-mono text-gray-900 flex items-center gap-1.5">
                              <span>{device.serialNo}</span>
                              <button
                                type="button"
                                onClick={() => handleCopySerial(device.serialNo)}
                                className="text-gray-400 hover:text-gray-700 p-0.5"
                                title="Copy Serial Number"
                              >
                                {copiedSerial === device.serialNo ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {device.name || 'Terminal ID: ' + device.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Vendor Badge */}
                      <td>
                        <Badge
                          variant={vendorConfig?.badgeVariant || 'neutral'}
                          size="sm"
                        >
                          {device.vendor}
                        </Badge>
                      </td>

                      {/* Gate Assignment */}
                      <td className="text-xs text-gray-700">
                        <div className="flex items-center gap-1.5 font-medium">
                          <DoorOpen className="w-3.5 h-3.5 text-gray-400" />
                          <span>{device.gateName || 'No gate assigned'}</span>
                        </div>
                      </td>

                      {/* Assigned Society */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-pink-50 text-[#cd0447] flex items-center justify-center text-[10px] font-bold">
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-900">
                              {soc ? soc.name : 'Unknown Society'}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {device.societyId.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Online Status with Green Pulse / Red Offline */}
                      <td>
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border bg-white shadow-xs">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isOnline
                                ? 'bg-emerald-500 pulse-green'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span
                            className={
                              isOnline ? 'text-emerald-700' : 'text-rose-700'
                            }
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </td>

                      {/* Last Heartbeat */}
                      <td className="text-xs text-gray-500 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {device.lastSeenAt
                              ? new Date(device.lastSeenAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })
                              : 'No signal'}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => handleCopySerial(device.serialNo)}
                          className="btn-secondary !text-xs !py-1 !px-2.5"
                        >
                          Copy Serial
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision Terminal Modal */}
      <Modal
        isOpen={isProvisionOpen}
        onClose={() => {
          if (!isSubmitting) {
            setIsProvisionOpen(false);
            setFormErrors({});
          }
        }}
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <span>Provision Hardware Biometric Terminal</span>
          </div>
        }
        size="lg"
      >
        <form onSubmit={handleProvisionSubmit} className="space-y-5" noValidate>
          <p className="text-xs text-gray-500">
            Register an M50 SpeedFace, ZKTeco, or eSSL hardware terminal and bind it to a tenant gated community.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Vendor Selector */}
            <div>
              <label className="field-label field-required">Hardware Vendor</label>
              <select
                value={formData.vendor}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    vendor: e.target.value as DeviceVendor,
                  })
                }
                disabled={isSubmitting}
                className="field"
              >
                {VENDORS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Serial Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="field-label field-required !mb-0">Serial Number</label>
                <button
                  type="button"
                  onClick={handleGenerateSerial}
                  className="text-[11px] font-semibold text-[#cd0447] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Generate</span>
                </button>
              </div>
              <input
                type="text"
                value={formData.serialNo}
                onChange={(e) => {
                  setFormData({ ...formData, serialNo: e.target.value });
                  if (formErrors.serialNo) setFormErrors({ ...formErrors, serialNo: '' });
                }}
                placeholder="e.g. M50-884210"
                disabled={isSubmitting}
                className={`field font-mono uppercase ${formErrors.serialNo ? 'field-invalid' : ''}`}
              />
              {formErrors.serialNo && <p className="field-error">{formErrors.serialNo}</p>}
            </div>

            {/* Target Society Selection */}
            <div className="sm:col-span-2">
              <label className="field-label field-required">Tenant Gated Society</label>
              <select
                value={formData.societyId}
                onChange={(e) => {
                  setFormData({ ...formData, societyId: e.target.value, gateId: '' });
                  if (formErrors.societyId) setFormErrors({ ...formErrors, societyId: '' });
                }}
                disabled={isSubmitting || societies.length === 0}
                className={`field ${formErrors.societyId ? 'field-invalid' : ''}`}
              >
                {societies.length === 0 ? (
                  <option value="">No societies available (Onboard a society first)</option>
                ) : (
                  societies.map((soc) => (
                    <option key={soc.id} value={soc.id}>
                      {soc.name} ({soc.timezone}) — ID: {soc.id.slice(0, 8)}
                    </option>
                  ))
                )}
              </select>
              {formErrors.societyId && <p className="field-error">{formErrors.societyId}</p>}
            </div>

            {/* Gate Assignment */}
            <div>
              <label className="field-label">Gate Assignment (Optional)</label>
              <div className="relative">
                <DoorOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
                <select
                  value={formData.gateId || ''}
                  onChange={(e) => setFormData({ ...formData, gateId: e.target.value })}
                  disabled={isSubmitting || !formData.societyId}
                  className="field !pl-10"
                >
                  <option value="">No gate assigned</option>
                  {societyGates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              {formData.societyId && societyGates.length === 0 && (
                <p className="field-hint">
                  This society hasn't defined any gates yet — its admin can add one from
                  the web app's Gates page.
                </p>
              )}
            </div>

            {/* Friendly Device Name */}
            <div>
              <label className="field-label">Terminal Friendly Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Main Entry M50 Face Scanner"
                disabled={isSubmitting}
                className="field"
              />
            </div>

            {/* Auth Token Secret */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="field-label !mb-0">Hardware Auth Token Secret (Optional)</label>
                <button
                  type="button"
                  onClick={handleGenerateSecret}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Key className="w-3 h-3" />
                  <span>Generate Token</span>
                </button>
              </div>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={formData.authToken || ''}
                  onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                  placeholder="e.g. sec_9b2d8e4f1a0c..."
                  disabled={isSubmitting}
                  className="field font-mono text-xs !pl-10"
                />
              </div>
              <p className="field-hint">Used for device MQTT / HTTP heartbeat signature verification.</p>
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsProvisionOpen(false)}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || societies.length === 0}
              className="btn-primary"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Provisioning Terminal...</span>
                </>
              ) : (
                <>
                  <Cpu className="w-4 h-4" />
                  <span>Provision Device</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DevicesPage;
