import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  UserCheck,
  Cpu,
  History,
  Plus,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Megaphone,
  MessageSquareWarning,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  AlertCircle,
  Building2,
  Users,
  Radio,
  DoorOpen,
  Camera,
} from 'lucide-react';
import { societyAdminApi } from '../../api/society-admin.api';
import type { SocietyDashboardStats, EntryEvent } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';
import { useCache } from '../../context/CacheContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const STATS_KEY = (societyId: string) => `admin/dashboard/stats|society:${societyId}`;
const LOGS_KEY = (societyId: string) => `admin/dashboard/logs|society:${societyId}`;

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeContext } = useRole();
  const { latestEntryEvent, isConnected } = useRealtime();
  const { error: toastError } = useToast();
  const cache = useCache();

  const societyId =
    activeContext?.societyId ||
    (activeContext?.type === 'SOCIETY' ? activeContext.id : '') ||
    '';
  const societyName = activeContext?.societyName || activeContext?.label || 'Society Admin';

  const statsKey = useMemo(() => STATS_KEY(societyId || 'none'), [societyId]);
  const logsKey = useMemo(() => LOGS_KEY(societyId || 'none'), [societyId]);

  const fetchStats = useCallback(
    () => societyAdminApi.getDashboardStats(societyId),
    [societyId],
  );
  const fetchLogs = useCallback(
    async () => {
      const res = await societyAdminApi.getLogs(societyId, 1, 8);
      return res.data || [];
    },
    [societyId],
  );

  const {
    data: stats,
    isLoading: isLoadingStats,
    isRefreshing: isRefreshingStats,
    error: statsError,
    refetch: refetchStats,
  } = useCachedFetch<SocietyDashboardStats>(statsKey, fetchStats, {
    deps: [societyId],
    skipInitialFetch: !societyId,
  });

  const {
    data: recentLogs,
    isLoading: isLoadingLogs,
    isRefreshing: isRefreshingLogs,
    refetch: refetchLogs,
  } = useCachedFetch<EntryEvent[]>(logsKey, fetchLogs, {
    deps: [societyId],
    skipInitialFetch: !societyId,
  });

  const isLoading = isLoadingStats || isLoadingLogs;
  const isRefreshing = isRefreshingStats || isRefreshingLogs;

  const refresh = useCallback(async () => {
    await Promise.all([refetchStats(true), refetchLogs(true)]);
  }, [refetchStats, refetchLogs]);

  // Real-time Entry Event listener: Prepend newly received gate events into the cached entry.
  React.useEffect(() => {
    if (!latestEntryEvent || (latestEntryEvent.societyId && latestEntryEvent.societyId !== societyId)) {
      return;
    }
    const current = cache.get<EntryEvent[]>(logsKey)?.data ?? [];
    const exists = current.some((e) => e.id === latestEntryEvent.id);
    if (!exists) {
      cache.set<EntryEvent[]>(logsKey, [latestEntryEvent, ...current.slice(0, 7)], null);
    }
    const currentStats = cache.get<SocietyDashboardStats>(statsKey)?.data;
    if (currentStats) {
      cache.set<SocietyDashboardStats>(statsKey, {
        ...currentStats,
        todayEntries: currentStats.todayEntries + 1,
      }, null);
    }
  }, [latestEntryEvent, societyId, logsKey, statsKey, cache]);

  const errorMessage = statsError;

  // Surface fetch errors via toast (deduped so we don't spam on every refresh).
  React.useEffect(() => {
    if (errorMessage) {
      toastError(errorMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessage]);

  const getSubjectBadgeVariant = (type?: string): 'brand' | 'warning' | 'info' | 'success' | 'neutral' => {
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
      {/* Top Banner & Header */}
      <PageHeader
        title={`${societyName} — Dashboard`}
        subtitle="Live gate stream, residential units overview, staff roster, and access controls"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh telemetry"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/users?action=provision')}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Resident</span>
            </button>
          </div>
        }
      />

      {/* Error state if fetch failed */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Dashboard Retrieval Error</p>
            <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="btn-secondary !text-xs !py-1 !px-2.5 !bg-white hover:!bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Total Units */}
        <div
          onClick={() => navigate('/admin/units')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-[#cd0447]/30 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-pink-500/20 group-hover:scale-110 transition-transform duration-300">
              <Layers className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Residences
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                (stats?.totalUnits ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Total Residential Units</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#cd0447] font-semibold">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                Manage Units
              </span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* Metric 2: Active Staff */}
        <div
          onClick={() => navigate('/admin/staff')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
              <UserCheck className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Helpers
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                (stats?.activeStaff ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Active Domestic Staff</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-600 font-semibold">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Maids, Cooks & Drivers
              </span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* Metric 3: Total Hardware Devices */}
        <div
          onClick={() => navigate('/admin/devices')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
              <Cpu className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Hardware
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                (stats?.totalDevices ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Access Terminals & Bridges</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-indigo-600 font-semibold">
              <span className="flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                M50 Face Biometrics
              </span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* Metric 4: Today's Gate Entries */}
        <div
          onClick={() => navigate('/admin/gate-logs')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-amber-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-110 transition-transform duration-300">
              <History className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Security
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                (stats?.todayEntries ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Today&apos;s Gate Entries</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-amber-600 font-semibold">
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" />
                Live In/Out Logs
              </span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Entry Stream & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Gate Entry Stream */}
        <div className="lg:col-span-2 card-static p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-gray-900">Live Gate Entry Stream</h2>
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isConnected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? 'bg-emerald-500 animate-ping' : 'bg-gray-400'
                    }`}
                  />
                  {isConnected ? 'Real-time Socket' : 'Polling'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Instant stream of visitor arrivals, deliveries, and biometric badge-ins
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/gate-logs')}
              className="btn-secondary !text-xs !py-1.5 !px-3 self-start sm:self-auto flex items-center gap-1.5"
            >
              <span>View Full Audit Logs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {isLoading ? (
            <TableSkeleton columns={4} rows={5} />
          ) : (recentLogs?.length ?? 0) === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <DoorOpen className="w-12 h-12 mx-auto text-gray-300 mb-2 stroke-[1.5]" />
              <p className="font-semibold text-gray-700">No gate activity logged yet today</p>
              <p className="text-xs text-gray-400 mt-1">
                Entries will appear automatically when guards or M50 terminals verify visitors.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(recentLogs ?? []).map((log: EntryEvent) => {
                const isEntry = log.direction === 'IN';
                const displayName =
                  log.visitorName ||
                  log.staffName ||
                  (log.platform ? `${log.platform} Delivery` : 'Visitor');
                const targetUnit = log.unitNumber
                  ? `Unit ${log.unitNumber}${log.buildingName ? ` (${log.buildingName})` : ''}`
                  : log.staffId
                  ? 'Domestic Staff'
                  : 'Common Area';

                return (
                  <div
                    key={log.id}
                    onClick={() => navigate(`/admin/gate-logs?id=${log.id}`)}
                    className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-300 hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Direction Icon Badge */}
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

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900 truncate">
                            {displayName}
                          </span>
                          <Badge variant={getSubjectBadgeVariant(log.subjectType)} size="sm">
                            {log.subjectType}
                          </Badge>
                          {log.platform && (
                            <Badge variant="warning" size="sm">
                              {log.platform}
                            </Badge>
                          )}
                          {log.hasPhoto && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                              <Camera className="w-2.5 h-2.5 text-gray-600" />
                              Photo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 truncate">
                          <span>{targetUnit}</span>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-gray-400">
                            {log.source === 'M50_DEVICE' ? 'M50 Face Terminal' : 'Guard Kiosk'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end">
                      <span className="text-xs font-semibold text-gray-700">
                        {log.occurredAt
                          ? new Date(log.occurredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Just now'}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {isEntry ? 'CHECK-IN' : 'CHECK-OUT'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Quick Actions & Society Portal Shortcuts */}
        <div className="space-y-6">
          {/* Quick Action Shortcuts */}
          <div className="card-static p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Admin Quick Actions</h3>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => navigate('/admin/users?action=provision')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-[#cd0447]/40 hover:bg-pink-50/40 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pink-100/80 text-[#cd0447] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Provision Resident / User</div>
                    <div className="text-[11px] text-gray-500">Assign unit & generate credentials</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#cd0447] group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/staff?action=register')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-emerald-400/50 hover:bg-emerald-50/40 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Register Domestic Staff</div>
                    <div className="text-[11px] text-gray-500">Enroll helper & pair M50 Face ID</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/notices?action=create')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-amber-400/50 hover:bg-amber-50/40 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Publish Notice</div>
                    <div className="text-[11px] text-gray-500">Broadcast updates to residents</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/complaints')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-indigo-400/50 hover:bg-indigo-50/40 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <MessageSquareWarning className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Track Resident Complaints</div>
                    <div className="text-[11px] text-gray-500">Review tickets & update status</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-700 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>
          </div>

          {/* Society Summary Card */}
          <div className="card-static p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Security & Gate System</h3>
              <Badge variant="success" size="sm" dot>
                Online
              </Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Access Mode
                </span>
                <span className="font-semibold text-gray-900">Biometric + Guard App</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                  M50 Biometrics
                </span>
                <span className="font-semibold text-gray-900">Synced & Active</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Auto-Approval SLA
                </span>
                <span className="font-semibold text-emerald-600">&lt; 2 seconds</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Timezone
                </span>
                <span className="font-mono text-gray-700">Asia/Kolkata (IST)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
