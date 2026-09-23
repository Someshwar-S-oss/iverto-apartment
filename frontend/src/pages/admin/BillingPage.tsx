import React, { useMemo, useState } from 'react';
import {
  Receipt,
  TrendingUp,
  AlertTriangle,
  LayoutGrid,
  Layers,
  FileText,
  Download,
  Plus,
  RefreshCw,
  Filter,
  Home,
  Ban,
  BadgeIndianRupee,
  Tags,
  Trash2,
  Eye,
  X as XIcon,
  Sparkles,
} from 'lucide-react';
import { billingAdminApi } from '../../api/billing-admin.api';
import { billingResidentApi } from '../../api/billing-resident.api';
import { societyAdminApi } from '../../api/society-admin.api';
import type {
  AdhocCharge,
  AdhocChargeStatus,
  BillingPlan,
  ChargeCategory,
  ChargeTiming,
  ChargeType,
  Invoice,
  InvoiceStatus,
  PaymentMethod,
  Unit,
  UnitBillingPlanAssignment,
} from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge, type BadgeVariant } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SearchInput } from '../../components/ui/SearchInput';
import { TableSkeleton, EmptyState, NoResultsState } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useToast } from '../../context/ToastContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';

const DASHBOARD_KEY = (societyId: string) => `admin/billing/dashboard|society:${societyId}`;
const PLANS_KEY = (societyId: string) => `admin/billing/plans|society:${societyId}`;
const ASSIGNMENTS_KEY = (societyId: string) => `admin/billing/assignments|society:${societyId}`;
const CHARGE_TYPES_KEY = (societyId: string) => `admin/billing/charge-types|society:${societyId}`;
const CHARGES_KEY = (societyId: string) => `admin/billing/charges|society:${societyId}`;
const INVOICES_KEY = (societyId: string) => `admin/billing/invoices|society:${societyId}`;
const UNITS_KEY = (societyId: string) => `admin/units|society:${societyId}`;

type Tab = 'overview' | 'plans' | 'charges' | 'invoices' | 'reports';

const formatMoney = (amount: number | undefined | null): string =>
  `₹${(amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const invoiceStatusVariant = (status: InvoiceStatus): BadgeVariant => {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'PARTIALLY_PAID':
      return 'info';
    case 'OVERDUE':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'warning';
  }
};

const chargeStatusVariant = (status: AdhocChargeStatus): BadgeVariant => {
  switch (status) {
    case 'INVOICED':
      return 'success';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'warning';
  }
};

const renderPayerRoleBadge = (role?: string | null) => {
  if (!role) return null;
  const normalized = role.toUpperCase();
  if (normalized === 'OWNER') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
        Owner
      </span>
    );
  }
  if (normalized === 'TENANT') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
        Tenant
      </span>
    );
  }
  if (normalized === 'SOCIETY_ADMIN') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
        Admin Recorded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
      {role}
    </span>
  );
};

const renderPaymentMethodBadge = (method?: PaymentMethod | string | null) => {
  const m = (method || '').toUpperCase();
  if (m === 'RAZORPAY') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
        Razorpay
      </span>
    );
  }
  if (m === 'MANUAL') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Cash
      </span>
    );
  }
  if (m === 'OFFLINE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
        Cheque / Transfer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-50 text-gray-700 border border-gray-200">
      {method || 'OTHER'}
    </span>
  );
};

export const BillingPage: React.FC = () => {
  const { activeContext } = useRole();
  const { success: toastSuccess, error: toastError } = useToast();

  const societyId =
    activeContext?.societyId || (activeContext?.type === 'SOCIETY' ? activeContext.id : '') || '';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: dashboard, isLoading: isLoadingDashboard, refetch: refetchDashboard } = useCachedFetch(
    DASHBOARD_KEY(societyId || 'none'),
    () => billingAdminApi.getDashboard(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const { data: plansData, isLoading: isLoadingPlans, refetch: refetchPlans } = useCachedFetch<BillingPlan[]>(
    PLANS_KEY(societyId || 'none'),
    () => billingAdminApi.getPlans(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const { data: assignmentsData, refetch: refetchAssignments } = useCachedFetch<UnitBillingPlanAssignment[]>(
    ASSIGNMENTS_KEY(societyId || 'none'),
    () => billingAdminApi.getUnitAssignments(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const { data: chargeTypesData, refetch: refetchChargeTypes } = useCachedFetch<ChargeType[]>(
    CHARGE_TYPES_KEY(societyId || 'none'),
    () => billingAdminApi.getChargeTypes(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const { data: chargesData, isLoading: isLoadingCharges, refetch: refetchCharges } = useCachedFetch<AdhocCharge[]>(
    CHARGES_KEY(societyId || 'none'),
    () => billingAdminApi.getCharges(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const { data: invoicesData, isLoading: isLoadingInvoices, refetch: refetchInvoices } = useCachedFetch<Invoice[]>(
    INVOICES_KEY(societyId || 'none'),
    () => billingAdminApi.getInvoices(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const { data: unitsData } = useCachedFetch<Unit[]>(
    UNITS_KEY(societyId || 'none'),
    () => societyAdminApi.getUnits(societyId),
    { deps: [societyId], skipInitialFetch: !societyId },
  );

  const plans = useMemo(() => plansData ?? [], [plansData]);
  const assignments = useMemo(() => assignmentsData ?? [], [assignmentsData]);
  const chargeTypes = useMemo(() => chargeTypesData ?? [], [chargeTypesData]);
  const charges = useMemo(() => chargesData ?? [], [chargesData]);
  const invoices = useMemo(() => invoicesData ?? [], [invoicesData]);
  const units = useMemo(() => unitsData ?? [], [unitsData]);

  const refreshAll = async () => {
    await Promise.all([
      refetchDashboard(true),
      refetchPlans(true),
      refetchAssignments(true),
      refetchChargeTypes(true),
      refetchCharges(true),
      refetchInvoices(true),
    ]);
  };

  const handleGenerateBills = async () => {
    if (!societyId) return;
    setIsGenerating(true);
    try {
      const result = await billingAdminApi.generateBills(societyId);
      toastSuccess(
        `Generated bills for ${result.periodLabel}: ${result.invoicesCreated} new invoice(s), ${result.invoicesTouched} updated.`,
      );
      await Promise.all([refetchInvoices(true), refetchDashboard(true), refetchCharges(true)]);
    } catch (err: any) {
      toastError(err?.response?.data?.message || err?.message || 'Failed to generate bills.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!societyId) return;
    try {
      const blob = await billingAdminApi.exportReport(societyId, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `billing-ledger.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toastError('Failed to export report.');
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'plans', label: 'Billing Plans', icon: Layers },
    { id: 'charges', label: 'Charges', icon: BadgeIndianRupee },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      <PageHeader
        title="Billing & Maintenance"
        subtitle="Maintenance slabs, ad hoc charges, combined monthly invoices, and collection reports"
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="btn-secondary text-xs sm:text-sm !py-2 !px-3.5 flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleGenerateBills}
              disabled={isGenerating || !societyId}
              className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
              title="Combine this month's maintenance + pending charges into invoices now, instead of waiting for the 1st of next month"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Generating...' : "Generate This Month's Bills"}</span>
            </button>
          </div>
        }
      />

      <div className="flex items-center gap-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-[#cd0447] text-[#cd0447]'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab isLoading={isLoadingDashboard} dashboard={dashboard} />
      )}

      {activeTab === 'plans' && (
        <PlansTab
          societyId={societyId}
          plans={plans}
          assignments={assignments}
          units={units}
          isLoading={isLoadingPlans}
          onChanged={() => {
            void refetchPlans(true);
            void refetchAssignments(true);
          }}
        />
      )}

      {activeTab === 'charges' && (
        <ChargesTab
          societyId={societyId}
          charges={charges}
          chargeTypes={chargeTypes}
          plans={plans}
          units={units}
          isLoading={isLoadingCharges}
          onChanged={() => {
            void refetchCharges(true);
            void refetchInvoices(true);
            void refetchChargeTypes(true);
            void refetchDashboard(true);
          }}
        />
      )}

      {activeTab === 'invoices' && (
        <InvoicesTab
          societyId={societyId}
          invoices={invoices}
          isLoading={isLoadingInvoices}
          onChanged={() => {
            void refetchInvoices(true);
            void refetchDashboard(true);
          }}
        />
      )}

      {activeTab === 'reports' && <ReportsTab dashboard={dashboard} onExport={handleExport} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const OverviewTab: React.FC<{ isLoading: boolean; dashboard: any }> = ({ isLoading, dashboard }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
    <div className="card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-pink-100/80 text-[#cd0447] flex items-center justify-center shrink-0">
        <Home className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">
          {isLoading ? '...' : dashboard?.totalUnits ?? 0}
        </div>
        <div className="text-xs font-semibold text-gray-500">Total Units</div>
      </div>
    </div>
    <div className="card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">
          {isLoading ? '...' : formatMoney(dashboard?.totalOutstanding)}
        </div>
        <div className="text-xs font-semibold text-gray-500">Total Outstanding</div>
      </div>
    </div>
    <div className="card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center shrink-0">
        <Receipt className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">
          {isLoading ? '...' : dashboard?.overdueInvoices ?? 0}
        </div>
        <div className="text-xs font-semibold text-gray-500">Overdue Invoices</div>
      </div>
    </div>
    <div className="card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
        <TrendingUp className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">
          {isLoading ? '...' : formatMoney(dashboard?.collectedThisMonth)}
        </div>
        <div className="text-xs font-semibold text-gray-500">Collected This Month</div>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Billing Plans (slabs) + unit assignment
// ---------------------------------------------------------------------------

const PlansTab: React.FC<{
  societyId: string;
  plans: BillingPlan[];
  assignments: UnitBillingPlanAssignment[];
  units: Unit[];
  isLoading: boolean;
  onChanged: () => void;
}> = ({ societyId, plans, assignments, units, isLoading, onChanged }) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planAmount, setPlanAmount] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const [assignPlan, setAssignPlan] = useState<BillingPlan | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [isAssigning, setIsAssigning] = useState(false);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !planName.trim() || !planAmount) return;

    setIsSavingPlan(true);
    try {
      await billingAdminApi.createPlan(societyId, {
        name: planName.trim(),
        amount: Number(planAmount),
        description: planDescription.trim() || undefined,
      });
      toastSuccess(`Billing plan "${planName.trim()}" created.`);
      setIsPlanModalOpen(false);
      setPlanName('');
      setPlanAmount('');
      setPlanDescription('');
      onChanged();
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Failed to create billing plan.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const openAssignModal = (plan: BillingPlan) => {
    setAssignPlan(plan);
    const alreadyAssigned = assignments
      .filter((a) => a.billingPlanId === plan.id)
      .map((a) => a.unitId);
    setSelectedUnitIds(new Set(alreadyAssigned));
  };

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const handleAssignUnits = async () => {
    if (!societyId || !assignPlan || selectedUnitIds.size === 0) return;
    setIsAssigning(true);
    try {
      await billingAdminApi.assignUnitsToPlan(societyId, assignPlan.id, Array.from(selectedUnitIds));
      toastSuccess(`${selectedUnitIds.size} unit(s) assigned to "${assignPlan.name}".`);
      setAssignPlan(null);
      onChanged();
    } catch (err: any) {
      toastError('Failed to assign units.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (unitId: string) => {
    if (!societyId) return;
    try {
      await billingAdminApi.unassignUnitPlan(societyId, unitId);
      toastSuccess('Unit removed from its billing plan.');
      onChanged();
    } catch {
      toastError('Failed to unassign unit.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsPlanModalOpen(true)}
          className="btn-primary text-xs sm:text-sm !py-2 !px-4 flex items-center gap-2"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Billing Plan</span>
        </button>
      </div>

      {isLoading ? (
        <TableSkeleton columns={3} rows={3} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No billing plans / slabs yet"
          description='Create a slab (e.g. "2BHK Standard – ₹2500") and assign whichever units belong to it — no need to bill each unit separately.'
          action={
            <button type="button" onClick={() => setIsPlanModalOpen(true)} className="btn-primary text-xs">
              New Billing Plan
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const unitsOnPlan = assignments.filter((a) => a.billingPlanId === plan.id);
            return (
              <div key={plan.id} className="card p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                    <Badge variant={plan.isActive ? 'success' : 'neutral'} size="sm" dot={plan.isActive}>
                      {plan.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold text-[#cd0447]">{formatMoney(plan.amount)}<span className="text-xs text-gray-400 font-medium">/mo</span></div>
                  {plan.description && <p className="text-xs text-gray-500">{plan.description}</p>}
                  <p className="text-xs text-gray-500">{unitsOnPlan.length} unit(s) on this slab</p>
                </div>
                <button
                  type="button"
                  onClick={() => openAssignModal(plan)}
                  className="btn-secondary !text-xs !py-1.5 !px-3 w-full"
                >
                  Assign Units
                </button>
              </div>
            );
          })}
        </div>
      )}

      {assignments.length > 0 && (
        <div className="card-static overflow-hidden">
          <div className="p-4 border-b border-gray-100 text-sm font-bold text-gray-900">Unit Assignments</div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Billing Plan</th>
                  <th>Monthly Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments
                  .filter((a) => a.billingPlanId)
                  .map((a) => (
                    <tr key={a.unitId} className="hover:bg-gray-50/80">
                      <td className="text-sm font-semibold text-gray-900">
                        Unit {a.unitNumber} {a.buildingName ? <span className="text-gray-400 font-normal">({a.buildingName})</span> : null}
                      </td>
                      <td className="text-xs text-gray-700">{a.billingPlanName}</td>
                      <td className="text-xs text-gray-700">{formatMoney(a.billingPlanAmount)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => handleUnassign(a.unitId)}
                          className="btn-secondary !text-xs !py-1 !px-2.5"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        title={
          <div>
            <div className="font-bold text-gray-900">New Billing Plan / Slab</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              A recurring monthly amount you can assign to any group of units
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <div>
            <label className="form-label">Plan Name <span className="text-rose-500">*</span></label>
            <input
              type="text"
              required
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. 2BHK Standard Maintenance"
              className="input-base w-full"
              autoFocus
            />
          </div>
          <div>
            <label className="form-label">Monthly Amount (₹) <span className="text-rose-500">*</span></label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={planAmount}
              onChange={(e) => setPlanAmount(e.target.value)}
              placeholder="e.g. 2500"
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea
              rows={2}
              value={planDescription}
              onChange={(e) => setPlanDescription(e.target.value)}
              placeholder="Optional notes about what this slab covers"
              className="input-base w-full resize-y text-xs sm:text-sm"
            />
          </div>
          <div className="modal-footer pt-4">
            <button type="button" onClick={() => setIsPlanModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSavingPlan || !planName.trim() || !planAmount} className="btn-primary">
              {isSavingPlan ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Units Modal */}
      <Modal
        isOpen={Boolean(assignPlan)}
        onClose={() => setAssignPlan(null)}
        title={
          <div>
            <div className="font-bold text-gray-900">Assign Units to "{assignPlan?.name}"</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              Select every unit that should be billed {formatMoney(assignPlan?.amount)}/month on this slab
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {units.length === 0 ? (
              <div className="p-4 text-xs text-gray-500 text-center">No units found in this society.</div>
            ) : (
              units.map((unit) => (
                <label
                  key={unit.id}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedUnitIds.has(unit.id)}
                    onChange={() => toggleUnit(unit.id)}
                    className="rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447]"
                  />
                  <span className="font-semibold text-gray-900">Unit {unit.unitNumber}</span>
                  {unit.buildingName && <span className="text-gray-400 text-xs">({unit.buildingName})</span>}
                </label>
              ))
            )}
          </div>
          <div className="modal-footer pt-2">
            <button type="button" onClick={() => setAssignPlan(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssignUnits}
              disabled={isAssigning || selectedUnitIds.size === 0}
              className="btn-primary"
            >
              {isAssigning ? 'Assigning...' : `Assign ${selectedUnitIds.size} Unit(s)`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Charges (ad hoc)
// ---------------------------------------------------------------------------

const ChargesTab: React.FC<{
  societyId: string;
  charges: AdhocCharge[];
  chargeTypes: ChargeType[];
  plans: BillingPlan[];
  units: Unit[];
  isLoading: boolean;
  onChanged: () => void;
}> = ({ societyId, charges, chargeTypes, plans, units, isLoading, onChanged }) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ChargeCategory>('OTHER');
  const [timing, setTiming] = useState<ChargeTiming>('START_OF_MONTH');
  const [dueDateOverride, setDueDateOverride] = useState('');
  const [targetMode, setTargetMode] = useState<'UNITS' | 'PLAN' | 'ALL'>('UNITS');
  const [targetUnitIds, setTargetUnitIds] = useState<Set<string>>(new Set());
  const [targetPlanId, setTargetPlanId] = useState('');
  const [isSubmittingCharge, setIsSubmittingCharge] = useState(false);

  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState<ChargeCategory>('OTHER');
  const [newTypeAmount, setNewTypeAmount] = useState('');
  const [isSavingType, setIsSavingType] = useState(false);

  const resetChargeForm = () => {
    setTitle('');
    setAmount('');
    setCategory('OTHER');
    setTiming('START_OF_MONTH');
    setDueDateOverride('');
    setTargetMode('UNITS');
    setTargetUnitIds(new Set());
    setTargetPlanId('');
  };

  const applyChargeType = (chargeTypeId: string) => {
    const ct = chargeTypes.find((c) => c.id === chargeTypeId);
    if (!ct) return;
    setTitle(ct.name);
    setCategory(ct.category);
    if (ct.defaultAmount) setAmount(String(ct.defaultAmount));
  };

  const handleCreateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !title.trim() || !amount) return;

    if (targetMode === 'UNITS' && targetUnitIds.size === 0) {
      toastError('Select at least one unit.');
      return;
    }
    if (targetMode === 'PLAN' && !targetPlanId) {
      toastError('Select a billing plan.');
      return;
    }

    setIsSubmittingCharge(true);
    try {
      await billingAdminApi.createCharge(societyId, {
        title: title.trim(),
        amount: Number(amount),
        category,
        timing,
        dueDateOverride: dueDateOverride || undefined,
        unitIds: targetMode === 'UNITS' ? Array.from(targetUnitIds) : undefined,
        billingPlanId: targetMode === 'PLAN' ? targetPlanId : undefined,
        allUnitsInSociety: targetMode === 'ALL' ? true : undefined,
      });
      toastSuccess(timing === 'IMMEDIATE' ? 'Charge created and billed immediately.' : 'Charge created — will be combined into next bill.');
      setIsChargeModalOpen(false);
      resetChargeForm();
      onChanged();
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Failed to create charge.');
    } finally {
      setIsSubmittingCharge(false);
    }
  };

  const handleCancelCharge = async (charge: AdhocCharge) => {
    if (!societyId) return;
    try {
      await billingAdminApi.cancelCharge(societyId, charge.id);
      toastSuccess('Charge cancelled.');
      onChanged();
    } catch {
      toastError('Failed to cancel charge.');
    }
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !newTypeName.trim()) return;
    setIsSavingType(true);
    try {
      await billingAdminApi.createChargeType(societyId, {
        name: newTypeName.trim(),
        category: newTypeCategory,
        defaultAmount: newTypeAmount ? Number(newTypeAmount) : undefined,
      });
      toastSuccess('Charge type saved.');
      setNewTypeName('');
      setNewTypeAmount('');
      onChanged();
    } catch {
      toastError('Failed to save charge type.');
    } finally {
      setIsSavingType(false);
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!societyId) return;
    try {
      await billingAdminApi.deleteChargeType(societyId, id);
      onChanged();
    } catch {
      toastError('Failed to delete charge type.');
    }
  };

  const filteredCharges = useMemo(() => {
    return charges.filter((c) => {
      const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q || c.title.toLowerCase().includes(q) || c.unitNumber?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [charges, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search charges or unit..." className="w-full" />
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap justify-end">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-base !py-1.5 !text-xs w-40 cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING_GENERATION">Pending</option>
              <option value="INVOICED">Invoiced</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <button type="button" onClick={() => setIsTypesModalOpen(true)} className="btn-secondary text-xs !py-2 !px-3.5 flex items-center gap-1.5">
            <Tags className="w-4 h-4" />
            <span>Charge Types</span>
          </button>
          <button type="button" onClick={() => setIsChargeModalOpen(true)} className="btn-primary text-xs !py-2 !px-4 flex items-center gap-2">
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Charge</span>
          </button>
        </div>
      </div>

      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton columns={6} rows={5} /></div>
        ) : charges.length === 0 ? (
          <EmptyState
            icon={BadgeIndianRupee}
            title="No ad hoc charges yet"
            description="Raise an extra charge or fine against one unit, a whole slab, or the entire society."
            action={<button type="button" onClick={() => setIsChargeModalOpen(true)} className="btn-primary text-xs">New Charge</button>}
          />
        ) : filteredCharges.length === 0 ? (
          <NoResultsState query={searchQuery} onClear={() => { setSearchQuery(''); setStatusFilter('ALL'); }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Charge</th>
                  <th>Unit</th>
                  <th>Amount</th>
                  <th>Timing</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCharges.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80">
                    <td>
                      <div className="text-sm font-semibold text-gray-900">{c.title}</div>
                      <div className="text-[11px] text-gray-400">{c.category}</div>
                    </td>
                    <td className="text-xs text-gray-700">Unit {c.unitNumber}</td>
                    <td className="text-xs font-semibold text-gray-900">{formatMoney(c.amount)}</td>
                    <td>
                      <Badge variant={c.timing === 'IMMEDIATE' ? 'brand' : 'neutral'} size="sm">
                        {c.timing === 'IMMEDIATE' ? 'IMMEDIATE' : 'START OF MONTH'}
                      </Badge>
                    </td>
                    <td><Badge variant={chargeStatusVariant(c.status)} size="sm">{c.status.replace('_', ' ')}</Badge></td>
                    <td className="text-right">
                      {c.status === 'PENDING_GENERATION' && (
                        <button
                          type="button"
                          onClick={() => handleCancelCharge(c)}
                          className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1 ml-auto"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Charge Modal */}
      <Modal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        size="lg"
        title={
          <div>
            <div className="font-bold text-gray-900">Raise a New Charge</div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">An extra charge, tanker/utility fee, or fine</div>
          </div>
        }
      >
        <form onSubmit={handleCreateCharge} className="space-y-4">
          {chargeTypes.length > 0 && (
            <div>
              <label className="form-label">Use a saved charge type (optional)</label>
              <select onChange={(e) => e.target.value && applyChargeType(e.target.value)} defaultValue="" className="input-base w-full cursor-pointer">
                <option value="">Custom charge...</option>
                {chargeTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>{ct.name}{ct.defaultAmount ? ` – ${formatMoney(ct.defaultAmount)}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Title <span className="text-rose-500">*</span></label>
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Extra Tanker Water" className="input-base w-full" />
            </div>
            <div>
              <label className="form-label">Amount (₹) <span className="text-rose-500">*</span></label>
              <input type="number" required min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-base w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ChargeCategory)} className="input-base w-full cursor-pointer">
                <option value="MAINTENANCE">Maintenance</option>
                <option value="UTILITY">Utility (water, gas, etc.)</option>
                <option value="FINE">Fine</option>
                <option value="AMENITY">Amenity</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="form-label">When should this be billed?</label>
              <select value={timing} onChange={(e) => setTiming(e.target.value as ChargeTiming)} className="input-base w-full cursor-pointer">
                <option value="START_OF_MONTH">Combine into next month's bill</option>
                <option value="IMMEDIATE">Bill immediately (its own invoice, right now)</option>
              </select>
            </div>
          </div>

          {timing === 'IMMEDIATE' && (
            <div>
              <label className="form-label">Due date (optional — defaults to 7 days from now)</label>
              <input type="date" value={dueDateOverride} onChange={(e) => setDueDateOverride(e.target.value)} className="input-base w-full" />
            </div>
          )}

          <div>
            <label className="form-label">Who is this charge for?</label>
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                <input type="radio" checked={targetMode === 'UNITS'} onChange={() => setTargetMode('UNITS')} />
                <span>Specific unit(s)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                <input type="radio" checked={targetMode === 'PLAN'} onChange={() => setTargetMode('PLAN')} />
                <span>Everyone on a slab</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                <input type="radio" checked={targetMode === 'ALL'} onChange={() => setTargetMode('ALL')} />
                <span>Whole society</span>
              </label>
            </div>

            {targetMode === 'UNITS' && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                {units.map((unit) => (
                  <label key={unit.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                    <input
                      type="checkbox"
                      checked={targetUnitIds.has(unit.id)}
                      onChange={() =>
                        setTargetUnitIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(unit.id)) next.delete(unit.id);
                          else next.add(unit.id);
                          return next;
                        })
                      }
                      className="rounded border-gray-300 text-[#cd0447] focus:ring-[#cd0447]"
                    />
                    <span className="font-medium text-gray-800">Unit {unit.unitNumber}</span>
                  </label>
                ))}
              </div>
            )}

            {targetMode === 'PLAN' && (
              <select value={targetPlanId} onChange={(e) => setTargetPlanId(e.target.value)} className="input-base w-full cursor-pointer">
                <option value="">Select a billing plan...</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="modal-footer pt-4">
            <button type="button" onClick={() => setIsChargeModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmittingCharge || !title.trim() || !amount} className="btn-primary">
              {isSubmittingCharge ? 'Creating...' : 'Create Charge'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Charge Types Modal */}
      <Modal
        isOpen={isTypesModalOpen}
        onClose={() => setIsTypesModalOpen(false)}
        title={<div className="font-bold text-gray-900">Charge Type Catalog</div>}
      >
        <div className="space-y-4">
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {chargeTypes.length === 0 ? (
              <p className="text-xs text-gray-500">No saved charge types yet.</p>
            ) : (
              chargeTypes.map((ct) => (
                <div key={ct.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="text-xs">
                    <span className="font-semibold text-gray-900">{ct.name}</span>
                    <span className="text-gray-400"> — {ct.category}{ct.defaultAmount ? ` – ${formatMoney(ct.defaultAmount)}` : ''}</span>
                  </div>
                  <button type="button" onClick={() => handleDeleteType(ct.id)} className="p-1 text-gray-400 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleCreateType} className="space-y-3 pt-3 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Name (e.g. Water Tanker)"
                className="input-base !text-xs col-span-2"
              />
              <select value={newTypeCategory} onChange={(e) => setNewTypeCategory(e.target.value as ChargeCategory)} className="input-base !text-xs cursor-pointer">
                <option value="MAINTENANCE">Maintenance</option>
                <option value="UTILITY">Utility</option>
                <option value="FINE">Fine</option>
                <option value="AMENITY">Amenity</option>
                <option value="OTHER">Other</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newTypeAmount}
                onChange={(e) => setNewTypeAmount(e.target.value)}
                placeholder="Default amount (optional)"
                className="input-base !text-xs"
              />
            </div>
            <button type="submit" disabled={isSavingType || !newTypeName.trim()} className="btn-primary !text-xs !py-1.5 w-full">
              {isSavingType ? 'Saving...' : 'Add Charge Type'}
            </button>
          </form>
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const InvoicesTab: React.FC<{
  societyId: string;
  invoices: Invoice[];
  isLoading: boolean;
  onChanged: () => void;
}> = ({ societyId, invoices, isLoading, onChanged }) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  const [manualAmount, setManualAmount] = useState('');
  const [manualMethod, setManualMethod] = useState<'MANUAL' | 'OFFLINE'>('MANUAL');
  const [manualNote, setManualNote] = useState('');
  const [payerRole, setPayerRole] = useState<'OWNER' | 'TENANT' | ''>('OWNER');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchStatus = statusFilter === 'ALL' || inv.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || inv.unitNumber?.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [invoices, statusFilter, searchQuery]);

  const handleCloseDetail = () => {
    setSelectedInvoice(null);
    setManualAmount('');
    setManualNote('');
    setPayerRole('OWNER');
  };

  const openDetail = async (invoice: Invoice) => {
    if (!societyId) return;
    setIsLoadingDetail(true);
    try {
      const detail = await billingAdminApi.getInvoice(societyId, invoice.id);
      setSelectedInvoice(detail);
      setManualAmount('');
      setManualNote('');
      setPayerRole('OWNER');
    } catch {
      toastError('Failed to load invoice detail.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleVoid = async () => {
    if (!societyId || !invoiceToVoid) return;
    setIsVoiding(true);
    try {
      await billingAdminApi.voidInvoice(societyId, invoiceToVoid.id);
      toastSuccess('Invoice voided.');
      setInvoiceToVoid(null);
      handleCloseDetail();
      onChanged();
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Failed to void invoice.');
    } finally {
      setIsVoiding(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyId || !selectedInvoice || !manualAmount) return;
    setIsRecordingPayment(true);
    try {
      await billingAdminApi.recordManualPayment(societyId, selectedInvoice.id, {
        amount: Number(manualAmount),
        method: manualMethod,
        note: manualNote.trim() || undefined,
        payerRole: (payerRole || undefined) as 'OWNER' | 'TENANT' | undefined,
      });
      toastSuccess('Payment recorded.');
      const detail = await billingAdminApi.getInvoice(societyId, selectedInvoice.id);
      setSelectedInvoice(detail);
      setManualAmount('');
      setManualNote('');
      setPayerRole('OWNER');
      onChanged();
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Failed to record payment.');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!selectedInvoice) return;
    setIsDownloadingReceipt(true);
    try {
      const blob = await billingResidentApi.downloadReceiptPdf(
        selectedInvoice.unitId,
        selectedInvoice.id,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${selectedInvoice.invoiceNumber || selectedInvoice.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toastSuccess('Receipt PDF downloaded successfully.');
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Failed to download PDF receipt.');
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const outstanding = selectedInvoice ? Number(selectedInvoice.totalAmount) - Number(selectedInvoice.amountPaid) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search invoice # or unit..." className="w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base !py-1.5 !text-xs w-40 cursor-pointer">
            <option value="ALL">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="card-static overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton columns={7} rows={6} /></div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices generated yet"
            description={`Use "Generate This Month's Bills" or raise an immediate charge to create the first invoice.`}
          />
        ) : filteredInvoices.length === 0 ? (
          <NoResultsState query={searchQuery} onClear={() => { setSearchQuery(''); setStatusFilter('ALL'); }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Unit</th>
                  <th>Period</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/80">
                    <td className="text-xs font-mono text-gray-700">{inv.invoiceNumber}</td>
                    <td className="text-sm font-semibold text-gray-900">Unit {inv.unitNumber}</td>
                    <td className="text-xs text-gray-600">{inv.periodLabel}</td>
                    <td className="text-xs font-semibold text-gray-900">{formatMoney(inv.totalAmount)}</td>
                    <td className="text-xs text-gray-600">{formatMoney(inv.amountPaid)}</td>
                    <td className="text-xs text-gray-600">{formatDate(inv.dueDate)}</td>
                    <td><Badge variant={invoiceStatusVariant(inv.status)} size="sm">{inv.status.replace('_', ' ')}</Badge></td>
                    <td className="text-right">
                      <button type="button" onClick={() => void openDetail(inv)} className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1 ml-auto">
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={Boolean(selectedInvoice)}
        onClose={handleCloseDetail}
        size="lg"
        title={
          <div className="flex items-center justify-between w-full pr-2">
            <div>
              <div className="font-bold text-gray-900">{selectedInvoice?.invoiceNumber}</div>
              <div className="text-xs text-gray-500 font-normal mt-0.5">Unit {selectedInvoice?.unitNumber} • {selectedInvoice?.periodLabel}</div>
            </div>
            <div className="flex items-center gap-2">
              {selectedInvoice && (
                <Badge variant={invoiceStatusVariant(selectedInvoice.status)} size="sm">
                  {selectedInvoice.status.replace('_', ' ')}
                </Badge>
              )}
              {selectedInvoice && (
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  disabled={isDownloadingReceipt}
                  title="Download PDF Receipt"
                  className="btn-secondary !text-xs !py-1 !px-2.5 flex items-center gap-1.5 text-gray-700"
                >
                  <Download className={`w-3.5 h-3.5 ${isDownloadingReceipt ? 'animate-bounce' : ''}`} />
                  <span className="hidden sm:inline">
                    {isDownloadingReceipt ? 'Downloading...' : 'PDF Receipt'}
                  </span>
                </button>
              )}
            </div>
          </div>
        }
      >
        {isLoadingDetail ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : selectedInvoice ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {(selectedInvoice.lineItems || []).map((li) => (
                <div key={li.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{li.description}</div>
                    <div className="text-[11px] text-gray-400">{li.category}</div>
                  </div>
                  <div className="font-semibold text-gray-900">{formatMoney(li.amount)}</div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <div className="text-sm font-bold text-gray-900">Total</div>
                <div className="text-sm font-bold text-gray-900">{formatMoney(selectedInvoice.totalAmount)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-xs text-gray-500">Paid</div>
                <div className="text-sm font-bold text-emerald-600">{formatMoney(selectedInvoice.amountPaid)}</div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-xs text-gray-500">Outstanding</div>
                <div className="text-sm font-bold text-rose-600">{formatMoney(outstanding)}</div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-xs text-gray-500">Due Date</div>
                <div className="text-sm font-bold text-gray-900">{formatDate(selectedInvoice.dueDate)}</div>
              </div>
            </div>

            {(selectedInvoice.payments || []).length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">Payment History</div>
                <div className="space-y-2">
                  {(selectedInvoice.payments || []).map((p) => {
                    const txnId = (p as any).razorpayPaymentId || (p as any).razorpayOrderId;
                    return (
                      <div
                        key={p.id}
                        className="p-3 rounded-xl bg-gray-50 border border-gray-200/80 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.paidByName ? (
                              <span className="font-bold text-gray-900">{p.paidByName}</span>
                            ) : (
                              <span className="font-medium text-gray-500">Payer unspecified</span>
                            )}
                            {renderPayerRoleBadge(p.paidByRole)}
                            {renderPaymentMethodBadge(p.method)}
                          </div>
                          <span className="font-bold text-gray-900">{formatMoney(p.amount)}</span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-gray-500 flex-wrap gap-x-3 gap-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{formatDate(p.paidAt || p.createdAt)}</span>
                            <span className="text-gray-300">•</span>
                            <Badge
                              variant={
                                p.status === 'SUCCESS'
                                  ? 'success'
                                  : p.status === 'FAILED'
                                    ? 'danger'
                                    : 'neutral'
                              }
                              size="sm"
                            >
                              {p.status}
                            </Badge>
                            {txnId && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span className="font-mono text-gray-500">Ref: {txnId}</span>
                              </>
                            )}
                          </div>
                          {p.note && (
                            <div className="text-gray-600 italic">
                              Note: {p.note}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {outstanding > 0 && selectedInvoice.status !== 'CANCELLED' && (
              <form onSubmit={handleRecordPayment} className="p-4 rounded-xl bg-amber-50/90 border border-amber-200/90 space-y-3.5">
                <div className="text-xs font-bold text-amber-900 flex items-center justify-between">
                  <span>Record a manual/offline payment</span>
                  <span className="text-[11px] font-normal text-amber-700">Outstanding: {formatMoney(outstanding)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Payment Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={outstanding}
                      required
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      placeholder={`Up to ${formatMoney(outstanding)}`}
                      className="input-base !text-xs w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Payment Method <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={manualMethod}
                      onChange={(e) => setManualMethod(e.target.value as 'MANUAL' | 'OFFLINE')}
                      className="input-base !text-xs cursor-pointer w-full"
                    >
                      <option value="MANUAL">Cash</option>
                      <option value="OFFLINE">Cheque / Bank Transfer</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Received From (Resident Role)
                    </label>
                    <select
                      value={payerRole}
                      onChange={(e) => setPayerRole(e.target.value as 'OWNER' | 'TENANT' | '')}
                      className="input-base !text-xs cursor-pointer w-full"
                    >
                      <option value="OWNER">Unit Owner (Landlord)</option>
                      <option value="TENANT">Unit Tenant (Resident)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Payment Note / Ref
                    </label>
                    <input
                      type="text"
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="e.g. Cheque #482910, NEFT/UPI Ref, or Cash receipt no."
                      className="input-base !text-xs w-full"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRecordingPayment || !manualAmount}
                  className="btn-primary !text-xs !py-2 w-full mt-1"
                >
                  {isRecordingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </form>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                {selectedInvoice.status !== 'PAID' && selectedInvoice.status !== 'CANCELLED' ? (
                  <button
                    type="button"
                    onClick={() => setInvoiceToVoid(selectedInvoice)}
                    className="btn-secondary !text-xs !py-1.5 !px-3 flex items-center gap-1.5 text-rose-600"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    <span>Void Invoice</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  disabled={isDownloadingReceipt}
                  className="btn-secondary !text-xs !py-1.5 !px-3 flex items-center gap-1.5 text-gray-700"
                >
                  <Download className={`w-3.5 h-3.5 ${isDownloadingReceipt ? 'animate-bounce' : ''}`} />
                  <span>{isDownloadingReceipt ? 'Downloading...' : 'Download PDF Receipt'}</span>
                </button>
              </div>
              <button type="button" onClick={handleCloseDetail} className="btn-secondary !text-xs !py-1.5 !px-3">
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(invoiceToVoid)}
        onCancel={() => setInvoiceToVoid(null)}
        onConfirm={handleVoid}
        title="Void Invoice"
        message={`Are you sure you want to void invoice ${invoiceToVoid?.invoiceNumber}? This cannot be undone.`}
        confirmLabel="Void Invoice"
        variant="danger"
        isLoading={isVoiding}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const ReportsTab: React.FC<{ dashboard: any; onExport: (format: 'csv' | 'pdf') => void }> = ({ dashboard, onExport }) => (
  <div className="space-y-6">
    <div className="card-static p-6 space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900">Billing Ledger Export</h3>
        <p className="text-xs text-gray-500 mt-1">
          Every invoice ever generated — unit, period, amount billed, amount paid, balance, due date, and status.
          Use this to see who's paid, who hasn't, and by how much.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onExport('csv')} className="btn-secondary text-sm flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
        <button type="button" onClick={() => onExport('pdf')} className="btn-primary text-sm flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>Export PDF</span>
        </button>
      </div>
    </div>

    <OverviewTab isLoading={false} dashboard={dashboard} />
  </div>
);

export default BillingPage;
