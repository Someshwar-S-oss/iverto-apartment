import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  RefreshCw,
  Clock,
  Filter,
  Zap,
  DoorOpen,
} from 'lucide-react';
import { societyAdminApi } from '../../api/society-admin.api';
import type { Device, DeviceVendor } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';

export const DevicesPage: React.FC = () => {
  const { activeContext } = useRole();
  const { deviceHeartbeats } = useRealtime();
  const { error: toastError } = useToast();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';

  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');

  // Fetch society devices
  const fetchDevices = useCallback(
    async (showRefreshing = false) => {
      if (!societyId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const data = await societyAdminApi.getDevices(societyId);
        setDevices(data);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load provisioned devices.';
        toastError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [societyId, toastError],
  );

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Determine if device is actively online (< 5 minutes heartbeat)
  const isDeviceOnline = useCallback(
    (device: Device): boolean => {
      // 1. Check real-time socket heartbeat cache
      const socketHb =
        deviceHeartbeats[device.id] ||
        (device.serialNo ? deviceHeartbeats[device.serialNo] : undefined);
      if (socketHb?.lastSeenAt) {
        const lastSeen = new Date(socketHb.lastSeenAt).getTime();
        if (Date.now() - lastSeen < 5 * 60 * 1000) {
          return true;
        }
      }

      // 2. Check persisted lastSeenAt on device record
      if (device.lastSeenAt) {
        const lastSeen = new Date(device.lastSeenAt).getTime();
        return Date.now() - lastSeen < 5 * 60 * 1000;
      }

      return device.status === 'ONLINE';
    },
    [deviceHeartbeats],
  );

  // Filter devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        d.serialNo.toLowerCase().includes(q) ||
        (d.name && d.name.toLowerCase().includes(q)) ||
        d.vendor.toLowerCase().includes(q);

      const matchVendor =
        vendorFilter === 'ALL' || d.vendor === vendorFilter;

      return matchSearch && matchVendor;
    });
  }, [devices, searchQuery, vendorFilter]);

  const onlineCount = useMemo(() => {
    return devices.filter((d) => isDeviceOnline(d)).length;
  }, [devices, isDeviceOnline]);

  const getVendorBadge = (vendor: DeviceVendor) => {
    switch (vendor) {
      case 'M50':
        return <Badge variant="brand" size="sm">M50 Biometrics</Badge>;
      case 'ZKTECO':
        return <Badge variant="info" size="sm">ZKTeco</Badge>;
      case 'ESSL':
        return <Badge variant="warning" size="sm">eSSL Gate</Badge>;
      case 'MATRIX':
        return <Badge variant="purple" size="sm">Matrix</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{vendor}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Hardware Devices & Gate Terminals"
        subtitle="Provisioned biometric face readers, boom barrier bridges, and telemetry health"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => fetchDevices(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh hardware status"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Total Provisioned Terminals</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{devices.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Online & Active (&lt; 5m)</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1 flex items-center gap-2">
            <span>{onlineCount}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">M50 Face Biometric Units</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            {devices.filter((d) => d.vendor === 'M50').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-gray-500">Average Heartbeat SLA</div>
          <div className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-1.5 text-base">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>30s Interval</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card-static p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by serial number or name..."
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="input-base !py-1.5 !text-xs w-44 cursor-pointer"
          >
            <option value="ALL">All Hardware Vendors</option>
            <option value="M50">M50 Terminals</option>
            <option value="ZKTECO">ZKTeco Face</option>
            <option value="ESSL">eSSL Bridges</option>
            <option value="MATRIX">Matrix Gate</option>
          </select>
        </div>
      </div>

      {/* Devices List Table */}
      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={5} rows={5} />
          </div>
        ) : devices.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="No hardware devices assigned"
            description="Contact Superadmin to provision and register M50 terminals for your society."
          />
        ) : filteredDevices.length === 0 ? (
          <NoResultsState
            query={searchQuery}
            onClear={() => {
              setSearchQuery('');
              setVendorFilter('ALL');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device & Serial</th>
                  <th>Vendor & Type</th>
                  <th>Gate / Barrier Mapping</th>
                  <th>Last Heartbeat</th>
                  <th className="text-right">Live Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => {
                  const online = isDeviceOnline(device);

                  return (
                    <tr key={device.id} className="hover:bg-gray-50/80">
                      <td className="font-semibold text-gray-900">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              online
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            <Cpu className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-900">
                              {device.name || `Terminal #${device.serialNo.slice(-6)}`}
                            </div>
                            <div className="text-xs text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                              <span>SN: {device.serialNo}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{getVendorBadge(device.vendor)}</td>
                      <td>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                          <DoorOpen className="w-3.5 h-3.5 text-[#cd0447]" />
                          <span>{device.gateName || 'No gate assigned'}</span>
                        </div>
                      </td>
                      <td className="text-xs text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            {device.lastSeenAt
                              ? new Date(device.lastSeenAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })
                              : 'Heartbeat pending'}
                          </span>
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              online
                                ? 'bg-emerald-500 ring-4 ring-emerald-100 animate-pulse'
                                : 'bg-gray-400'
                            }`}
                          />
                          <span
                            className={`text-xs font-bold ${
                              online ? 'text-emerald-700' : 'text-gray-500'
                            }`}
                          >
                            {online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevicesPage;
