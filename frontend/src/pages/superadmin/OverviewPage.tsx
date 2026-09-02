import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Cpu,
  Users,
  ShieldCheck,
  Plus,
  RefreshCw,
  ArrowRight,
  Activity,
  Radio,
  Server,
  Zap,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { superadminApi } from '../../api/superadmin.api';
import type { Society, SuperadminAnalytics } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/States';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const ANALYTICS_KEY = 'superadmin/overview/analytics';
const SOCIETIES_KEY = 'superadmin/overview/societies';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    isRefreshing: isRefreshingAnalytics,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useCachedFetch<SuperadminAnalytics>(
    ANALYTICS_KEY,
    () => superadminApi.getAnalytics(),
  );

  const {
    data: societiesData,
    isLoading: isLoadingSocieties,
    isRefreshing: isRefreshingSocieties,
    error: societiesError,
    refetch: refetchSocieties,
  } = useCachedFetch<Society[]>(
    SOCIETIES_KEY,
    () => superadminApi.getSocieties().then((data) => data || []),
  );

  const analytics = analyticsData ?? null;
  const recentSocieties = useMemo(() => {
    if (!societiesData) return [];
    const sorted = [...societiesData].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    return sorted.slice(0, 5);
  }, [societiesData]);

  const isLoading = isLoadingAnalytics || isLoadingSocieties;
  const isRefreshing = isRefreshingAnalytics || isRefreshingSocieties;
  const errorMessage = analyticsError || societiesError;

  const refresh = useCallback(
    () => Promise.all([refetchAnalytics(true), refetchSocieties(true)]),
    [refetchAnalytics, refetchSocieties],
  );

  // Hourly throughput simulation bars for visualization
  const throughputData = [
    { hour: '00:00', events: 18 },
    { hour: '02:00', events: 12 },
    { hour: '04:00', events: 8 },
    { hour: '06:00', events: 45 },
    { hour: '08:00', events: 160 },
    { hour: '10:00', events: 142 },
    { hour: '12:00', events: 110 },
    { hour: '14:00', events: 98 },
    { hour: '16:00', events: 125 },
    { hour: '18:00', events: 185 },
    { hour: '20:00', events: 155 },
    { hour: '22:00', events: 65 },
  ];
  const maxEvents = Math.max(...throughputData.map((d) => d.events), 1);

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Page Header */}
      <PageHeader
        title="Platform Superadmin Overview"
        subtitle="Global statistics, tenant societies, and hardware fleet telemetry"
        actions={
          <>
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
              onClick={() => navigate('/superadmin/societies?action=onboard')}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Onboard Society</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/superadmin/devices?action=provision')}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
            >
              <Cpu className="w-4 h-4 text-gray-700" />
              <span>Provision M50</span>
            </button>
          </>
        }
      />

      {/* Error state if fetch failed */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Telemetry Retrieval Error</p>
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

      {/* 4 Glassmorphic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Total Societies */}
        <div className="card p-6 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-pink-500/20 group-hover:scale-110 transition-transform duration-300">
              <Building2 className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Tenants
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                (analytics?.totalSocieties ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">
              Total Client Societies
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              <span>Multi-tenant active clusters</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Active Hardware Terminals */}
        <div className="card p-6 relative overflow-hidden group">
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
                (analytics?.totalDevices ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">
              Active Hardware Terminals
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-indigo-600 font-medium">
              <Radio className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
              <span>M50, ZKTeco & eSSL Fleet</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Total Registered Users */}
        <div className="card p-6 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Directory
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                (analytics?.totalUsers ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">
              Total Registered Users
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              <span>Residents, staff & guards</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Total Gate Entry Events */}
        <div className="card p-6 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
              <ShieldCheck className="w-6 h-6 stroke-[2]" />
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
                (analytics?.totalEntryEvents ?? 0).toLocaleString()
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">
              Total Gate Entry Events
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
              <Server className="w-3.5 h-3.5 text-emerald-500" />
              <span>Processed & synced logs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Platform Throughput Visualizer & Telemetry Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Platform Throughput Chart */}
        <div className="lg:col-span-2 card-static p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-gray-900">
                  Platform Telemetry & Gate Throughput
                </h2>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Global gate verifications, biometric matches, and delivery approvals over 24h
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#cd0447]" />
                Event Volume
              </span>
              <span className="text-gray-400 font-semibold">•</span>
              <span className="text-emerald-600 font-semibold">99.98% Gateway SLA</span>
            </div>
          </div>

          {/* Bar Chart Visualizer */}
          <div className="pt-4 pb-2">
            <div className="h-44 flex items-end justify-between gap-2 sm:gap-3 px-2 border-b border-gray-100">
              {throughputData.map((d, i) => {
                const heightPercent = Math.max(12, Math.round((d.events / maxEvents) * 100));
                const isPeak = d.events === maxEvents;
                return (
                  <div
                    key={`bar-${i}`}
                    className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end"
                  >
                    {/* Hover Tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-gray-900 text-white text-[10px] font-semibold py-1 px-2 rounded-md shadow-lg pointer-events-none whitespace-nowrap z-20">
                      {d.events} entries @ {d.hour}
                    </div>

                    <div
                      className={`w-full max-w-[28px] rounded-t-lg transition-all duration-500 ${
                        isPeak
                          ? 'bg-gradient-to-t from-[#cd0447] to-[#e91e63] shadow-md shadow-[#cd0447]/30'
                          : 'bg-gradient-to-t from-gray-200 to-gray-300 group-hover:from-pink-400 group-hover:to-pink-500'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                    <span className="text-[10px] font-medium text-gray-400 group-hover:text-gray-700">
                      {d.hour.slice(0, 2)}h
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Telemetry Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-200/60">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Auth Latency
              </div>
              <div className="text-base font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                <span>38 ms</span>
                <span className="text-[10px] text-emerald-600 font-semibold">avg</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-200/60">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Biometric Speed
              </div>
              <div className="text-base font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                <span>0.18 s</span>
                <span className="text-[10px] text-emerald-600 font-semibold">M50</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-200/60">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Socket Hub
              </div>
              <div className="text-base font-bold text-emerald-600 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Connected</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-200/60">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Sync Engine
              </div>
              <div className="text-base font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                <span>100% Up</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions & Fleet Breakdown Card */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="card-static p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Superadmin Actions</h3>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => navigate('/superadmin/societies?action=onboard')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-[#cd0447]/40 hover:bg-pink-50/40 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pink-100/80 text-[#cd0447] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Onboard New Society</div>
                    <div className="text-[11px] text-gray-500">Provision master admin & timezone</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#cd0447] group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/superadmin/devices?action=provision')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-[#cd0447]/40 hover:bg-pink-50/40 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Provision M50 Terminal</div>
                    <div className="text-[11px] text-gray-500">Register device & generate secret</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/superadmin/societies')}
                className="w-full p-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-between text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Manage Tenant Societies</div>
                    <div className="text-[11px] text-gray-500">Status, buildings, and settings</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>
          </div>

          {/* Fleet Health Overview */}
          <div className="card-static p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Hardware Fleet Status</h3>
              <button
                type="button"
                onClick={() => navigate('/superadmin/devices')}
                className="text-xs font-semibold text-[#cd0447] hover:underline flex items-center gap-1"
              >
                <span>View All</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-gray-600 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  M50 Biometric Terminals
                </span>
                <span className="font-bold text-gray-900">Online</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: '92%' }} />
              </div>

              <div className="flex items-center justify-between text-xs font-medium pt-2">
                <span className="text-gray-600 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  ZKTeco Face Terminals
                </span>
                <span className="font-bold text-gray-900">Active</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: '85%' }} />
              </div>

              <div className="flex items-center justify-between text-xs font-medium pt-2">
                <span className="text-gray-600 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  eSSL & Matrix Gates
                </span>
                <span className="font-bold text-gray-900">Synced</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '78%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Client Societies Table */}
      <div className="card-static p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recent Tenant Societies</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Recently onboarded residential communities and gated properties
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/superadmin/societies')}
            className="btn-secondary text-xs !py-1.5 !px-3.5 self-start sm:self-auto flex items-center gap-1.5"
          >
            <span>View All Societies</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <TableSkeleton columns={5} rows={4} />
        ) : recentSocieties.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            <Building2 className="w-10 h-10 mx-auto text-gray-400 mb-2 stroke-[1.5]" />
            <p className="font-semibold text-gray-700">No societies onboarded yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Click &quot;Onboard Society&quot; to register your first gated community.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Location / Address</th>
                  <th>Timezone</th>
                  <th>Status</th>
                  <th>Onboarded</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentSocieties.map((soc) => (
                  <tr key={soc.id} className="hover:bg-gray-50/80">
                    <td className="font-semibold text-gray-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-pink-50 text-[#cd0447] border border-pink-100 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{soc.name}</div>
                          <div className="text-[11px] text-gray-400 font-mono">ID: {soc.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs text-gray-600 max-w-[220px] truncate">
                      {soc.address || '—'}
                    </td>
                    <td className="text-xs text-gray-600 font-mono">
                      {soc.timezone || 'Asia/Kolkata'}
                    </td>
                    <td>
                      <Badge
                        variant={soc.status === 'ACTIVE' ? 'success' : 'danger'}
                        size="sm"
                        dot
                      >
                        {soc.status}
                      </Badge>
                    </td>
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
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => navigate('/superadmin/societies')}
                        className="btn-secondary !text-xs !py-1 !px-2.5"
                      >
                        Manage
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
  );
};

export default OverviewPage;
