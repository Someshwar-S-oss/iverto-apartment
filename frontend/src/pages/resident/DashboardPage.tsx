import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Package,
  Users,
  KeyRound,
  History,
  ArrowRight,
  RefreshCw,
  Plus,
  Truck,
  User as UserIcon,
  Sparkles,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  MessageSquareWarning,
  Sliders,
} from 'lucide-react';
import { residentApi } from '../../api/resident.api';
import type { Approval, EntryEvent, Staff, Passcode } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useToast } from '../../context/ToastContext';
import { playAllowChime, playDenyChime } from '../../components/real-time/SoundEffects';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeContext } = useRole();
  const { incomingApproval, latestEntryEvent, isConnected, clearIncomingApproval } = useRealtime();
  const toast = useToast();

  const unitId =
    activeContext?.unitId ||
    (activeContext?.type === 'UNIT' ? activeContext.id : '') ||
    '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || 'My Unit';
  const buildingName = activeContext?.buildingName || '';
  const societyName = activeContext?.societyName || 'Society';

  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<Staff[]>([]);
  const [passcodes, setPasscodes] = useState<Passcode[]>([]);
  const [recentEvents, setRecentEvents] = useState<EntryEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  // Load all summary dashboard data for this unit
  const loadDashboardData = useCallback(
    async (showRefreshing = false) => {
      if (!unitId) return;

      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [approvalsData, staffData, passcodesData, eventsData] = await Promise.all([
          residentApi.getPendingApprovals(unitId).catch(() => []),
          residentApi.getStaff(unitId).catch(() => []),
          residentApi.listPasscodes(unitId).catch(() => []),
          residentApi.getEntryEvents(unitId, 1, 8).catch(() => ({ data: [], total: 0 })),
        ]);

        setPendingApprovals(approvalsData || []);
        setAssignedStaff(staffData || []);
        setPasscodes(passcodesData || []);
        setRecentEvents(eventsData.data || []);
      } catch (err: any) {
        console.error('Failed to load resident dashboard metrics:', err);
        toast.error('Failed to fetch dashboard updates. Please refresh.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [unitId, toast],
  );

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Real-time listener for incoming approval requests
  useEffect(() => {
    if (incomingApproval && (!incomingApproval.unitId || incomingApproval.unitId === unitId)) {
      setPendingApprovals((prev) => {
        const exists = prev.some((a) => a.id === incomingApproval.approvalId);
        if (exists) return prev;
        const newApproval: Approval = {
          id: incomingApproval.approvalId,
          entryEventId: incomingApproval.entryEventId,
          unitId: incomingApproval.unitId || unitId,
          status: 'PENDING',
          validUntil: incomingApproval.expiresAt || new Date(Date.now() + 180000).toISOString(),
          createdAt: incomingApproval.createdAt || new Date().toISOString(),
          visitorName: incomingApproval.visitorName,
          visitorPhone: incomingApproval.visitorPhone,
          subjectType: incomingApproval.subjectType as any,
          platform: incomingApproval.platform as any,
          unitNumber: incomingApproval.unitNumber,
        };
        return [newApproval, ...prev];
      });
    }
  }, [incomingApproval, unitId]);

  // Real-time listener for gate events
  useEffect(() => {
    if (latestEntryEvent && (!latestEntryEvent.unitId || latestEntryEvent.unitId === unitId)) {
      setRecentEvents((prev) => {
        const exists = prev.some((e) => e.id === latestEntryEvent.id);
        if (exists) return prev;
        return [latestEntryEvent, ...prev.slice(0, 7)];
      });
    }
  }, [latestEntryEvent, unitId]);

  // Handle Quick Approve / Reject decision on callout card
  const handleDecide = async (approvalId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!unitId || decidingId) return;
    setDecidingId(approvalId);

    try {
      if (decision === 'APPROVED') {
        playAllowChime();
      } else {
        playDenyChime();
      }

      await residentApi.decideApproval(unitId, approvalId, decision);
      toast.success(decision === 'APPROVED' ? 'Visitor entry approved!' : 'Visitor entry rejected.');

      setPendingApprovals((prev) => prev.filter((a) => a.id !== approvalId));
      if (incomingApproval?.approvalId === approvalId) {
        clearIncomingApproval();
      }
    } catch (err: any) {
      console.error('Failed to submit approval decision:', err);
      toast.error(err.response?.data?.message || 'Failed to submit decision to gate.');
    } finally {
      setDecidingId(null);
    }
  };

  // Derived KPI metrics
  const activePasscodesCount = useMemo(() => {
    const now = new Date().getTime();
    return passcodes.filter((p) => !p.revoked && new Date(p.validUntil).getTime() > now).length;
  }, [passcodes]);

  const todayEntriesCount = useMemo(() => {
    const today = new Date().toDateString();
    return recentEvents.filter(
      (e) => e.occurredAt && new Date(e.occurredAt).toDateString() === today,
    ).length;
  }, [recentEvents]);

  const activeStaffCount = useMemo(() => {
    return assignedStaff.filter((s) => s.status === 'ACTIVE').length;
  }, [assignedStaff]);

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
      {/* Page Header */}
      <PageHeader
        title={`Flat ${unitNumber} ${buildingName ? `(${buildingName})` : ''}`}
        subtitle={`${societyName} — Resident Access Dashboard & Gate Approvals`}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => loadDashboardData(true)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
              title="Refresh flat data"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#cd0447]' : ''}`}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/resident/passcodes?action=generate')}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Guest Pass</span>
            </button>
          </div>
        }
      />

      {/* Quick Action Navigation Pills */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => navigate('/resident/passcodes?action=generate')}
          className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-[#cd0447]/40 hover:bg-pink-50/30 text-gray-800 text-xs sm:text-sm font-semibold transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <KeyRound className="w-4 h-4 text-[#cd0447]" />
          <span>Generate Guest Pass</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/resident/deliveries')}
          className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-amber-400 hover:bg-amber-50/30 text-gray-800 text-xs sm:text-sm font-semibold transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Sliders className="w-4 h-4 text-amber-600" />
          <span>Delivery Automation</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/resident/staff')}
          className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/30 text-gray-800 text-xs sm:text-sm font-semibold transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Manage Staff</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/resident/community?tab=complaints&action=raise')}
          className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30 text-gray-800 text-xs sm:text-sm font-semibold transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <MessageSquareWarning className="w-4 h-4 text-indigo-600" />
          <span>Report Maintenance Issue</span>
        </button>
      </div>

      {/* Live Pending Approval Callout Card (If Visitor is Waiting) */}
      {pendingApprovals.length > 0 && (
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-pink-50 via-rose-50 to-orange-50 border-2 border-[#cd0447]/30 shadow-md space-y-4 animate-scale-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#cd0447] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#cd0447]" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                Visitor Waiting at Gate ({pendingApprovals.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/resident/approvals')}
              className="text-xs font-bold text-[#cd0447] hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingApprovals.slice(0, 2).map((approval) => {
              const isDelivery =
                approval.subjectType === 'DELIVERY' || Boolean(approval.platform);
              const isStaff = approval.subjectType === 'STAFF';
              const name =
                approval.visitorName ||
                (isDelivery ? `${approval.platform || 'Courier'} Partner` : 'Guest Visitor');

              return (
                <div
                  key={approval.id}
                  className="p-4 rounded-xl bg-white/90 backdrop-blur-md border border-pink-200/80 shadow-sm flex flex-col justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    {/* Visitor Thumbnail */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-pink-200 flex items-center justify-center bg-pink-50">
                      {approval.entryEventId ? (
                        <img
                          src={`/api/v1/mobile/entry-events/${approval.entryEventId}/photo`}
                          alt={name}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                      {isDelivery ? (
                        <Truck className="w-6 h-6 text-amber-600" />
                      ) : isStaff ? (
                        <Sparkles className="w-6 h-6 text-sky-600" />
                      ) : (
                        <UserIcon className="w-6 h-6 text-[#cd0447]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-900 truncate">{name}</span>
                        <Badge
                          variant={isDelivery ? 'warning' : isStaff ? 'info' : 'brand'}
                          size="sm"
                        >
                          {approval.subjectType || 'VISITOR'}
                        </Badge>
                      </div>
                      {approval.visitorPhone && (
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          {approval.visitorPhone}
                        </p>
                      )}
                      <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Arrived {new Date(approval.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Decision Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={decidingId === approval.id}
                      onClick={() => handleDecide(approval.id, 'REJECTED')}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                    <button
                      type="button"
                      disabled={decidingId === approval.id}
                      onClick={() => handleDecide(approval.id, 'APPROVED')}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Pending Approvals */}
        <div
          onClick={() => navigate('/resident/approvals')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-[#cd0447]/30 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-pink-500/20 group-hover:scale-110 transition-transform duration-300">
              <ShieldCheck className="w-6 h-6 stroke-[2]" />
            </div>
            {pendingApprovals.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">
                ACTION REQ
              </span>
            )}
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                pendingApprovals.length
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Pending Gate Approvals</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#cd0447] font-semibold">
              <span>Review Requests</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* KPI 2: Domestic Staff Inside */}
        <div
          onClick={() => navigate('/resident/staff')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Household
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                activeStaffCount
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Assigned Domestic Helpers</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-600 font-semibold">
              <span>View Maids & Cooks</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* KPI 3: Today's Flat Entries */}
        <div
          onClick={() => navigate('/resident/activity')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-amber-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-110 transition-transform duration-300">
              <History className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Today
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                todayEntriesCount
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Today's Unit Entries</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-amber-600 font-semibold">
              <span>View Activity Log</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* KPI 4: Active Guest Passcodes */}
        <div
          onClick={() => navigate('/resident/passcodes')}
          className="card p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
              <KeyRound className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              PIN / Pass
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 animate-pulse rounded-md" />
              ) : (
                activePasscodesCount
              )}
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-1">Active Guest Passcodes</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-indigo-600 font-semibold">
              <span>Manage Passcodes</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Activity Timeline & Domestic Helper Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Unit Activity Stream */}
        <div className="lg:col-span-2 card-static p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">Recent Entry Activity</h2>
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
                  {isConnected ? 'Real-time' : 'Updated'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Timeline of visitors, courier deliveries, and helper badge scans
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/resident/activity')}
              className="btn-secondary !text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            >
              <span>View Full History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {isLoading ? (
            <TableSkeleton columns={3} rows={5} />
          ) : recentEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <History className="w-12 h-12 mx-auto text-gray-300 mb-2 stroke-[1.5]" />
              <p className="font-semibold text-gray-700">No entry events recorded recently</p>
              <p className="text-xs text-gray-400 mt-1">
                When visitors or delivery agents arrive, their check-ins will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentEvents.map((evt) => {
                const isEntry = evt.direction === 'IN';
                const displayName =
                  evt.visitorName ||
                  evt.staffName ||
                  (evt.platform ? `${evt.platform} Partner` : 'Guest Visitor');

                return (
                  <div
                    key={evt.id}
                    onClick={() => navigate(`/resident/activity?id=${evt.id}`)}
                    className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-300 hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* In/Out Icon */}
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
                          <Badge variant={getSubjectBadgeVariant(evt.subjectType)} size="sm">
                            {evt.subjectType}
                          </Badge>
                          {evt.platform && (
                            <Badge variant="warning" size="sm">
                              {evt.platform}
                            </Badge>
                          )}
                          {evt.hasPhoto && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                              <Camera className="w-2.5 h-2.5 text-gray-600" />
                              Photo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 truncate">
                          <span>
                            {evt.source === 'M50_DEVICE'
                              ? 'M50 Face Terminal'
                              : evt.source === 'PASSCODE'
                              ? 'Passcode Verification'
                              : 'Security Gate Check-in'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end">
                      <span className="text-xs font-semibold text-gray-700">
                        {evt.occurredAt
                          ? new Date(evt.occurredAt).toLocaleTimeString([], {
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

        {/* Right 1 Col: Domestic Helpers Roster & Quick Shortcuts */}
        <div className="space-y-6">
          {/* Assigned Staff Preview */}
          <div className="card-static p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Household Staff</h3>
              <button
                type="button"
                onClick={() => navigate('/resident/staff')}
                className="text-xs font-semibold text-[#cd0447] hover:underline"
              >
                Manage
              </button>
            </div>

            {assignedStaff.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Users className="w-8 h-8 mx-auto text-gray-300 mb-1.5 stroke-[1.5]" />
                <p className="text-xs font-semibold text-gray-700">No staff assigned</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Assign maids, cooks or drivers to your flat.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/resident/staff?action=assign')}
                  className="btn-secondary !text-xs !py-1 !px-2.5 mt-3"
                >
                  Assign Staff
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {assignedStaff.slice(0, 4).map((st) => (
                  <div
                    key={st.id}
                    className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-pink-100 text-[#cd0447] font-bold text-xs flex items-center justify-center shrink-0">
                        {st.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">{st.name}</div>
                        <div className="text-[10px] text-gray-500">{st.staffType}</div>
                      </div>
                    </div>

                    <Badge
                      variant={st.status === 'ACTIVE' ? 'success' : 'neutral'}
                      size="sm"
                      dot
                    >
                      {st.status === 'ACTIVE' ? 'ACTIVE' : 'AWAY'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Pre-Approval Summary Card */}
          <div className="card-static p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-gray-900">Delivery Rules</h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/resident/deliveries')}
                className="text-xs font-semibold text-[#cd0447] hover:underline"
              >
                Configure
              </button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Auto-approve Blinkit, Zepto, Swiggy, and Amazon delivery agents or instruct gate to hold packages.
            </p>
            <button
              type="button"
              onClick={() => navigate('/resident/deliveries')}
              className="w-full btn-secondary text-xs !py-2 flex items-center justify-center gap-1.5"
            >
              <span>Manage 7 Platforms</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
