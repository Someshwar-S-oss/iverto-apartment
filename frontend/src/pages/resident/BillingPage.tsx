import React, { useMemo, useState } from 'react';
import {
  Wallet,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  Building2,
  Search,
  X,
  Download,
} from 'lucide-react';
import { billingResidentApi } from '../../api/billing-resident.api';
import type { Invoice } from '../../api/types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge, type BadgeVariant } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, TableSkeleton } from '../../components/ui/States';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useCachedFetch } from '../../hooks/useCachedFetch';
import { openRazorpayCheckout } from '../../lib/razorpay';

const INVOICES_KEY = (unitId: string) => `resident/billing/invoices|unit:${unitId}`;

const formatMoney = (amount: number | undefined | null): string =>
  `₹${(amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const statusVariant = (status: Invoice['status']): BadgeVariant => {
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

const formatRoleName = (roleStr?: string | null): string => {
  if (!roleStr) return '';
  switch (roleStr.toUpperCase()) {
    case 'OWNER':
      return 'Owner';
    case 'TENANT':
      return 'Tenant';
    case 'FAMILY':
      return 'Family Member';
    case 'SOCIETY_ADMIN':
      return 'Society Admin';
    default:
      return roleStr.charAt(0).toUpperCase() + roleStr.slice(1).toLowerCase();
  }
};

const renderRoleBadge = (r?: string | null) => {
  if (!r) return null;
  const normalized = r.toUpperCase();
  if (normalized === 'OWNER') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
        Owner
      </span>
    );
  }
  if (normalized === 'TENANT') {
    return <Badge variant="warning">Tenant</Badge>;
  }
  if (normalized === 'FAMILY') {
    return <Badge variant="info">Family Member</Badge>;
  }
  return <Badge variant="neutral">{normalized}</Badge>;
};

const renderCategoryChip = (category?: string | null) => {
  const cat = (category || 'OTHER').toUpperCase();
  switch (cat) {
    case 'MAINTENANCE':
      return (
        <span
          key={cat}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200"
        >
          Maintenance
        </span>
      );
    case 'UTILITY':
      return (
        <span
          key={cat}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200"
        >
          Utility
        </span>
      );
    case 'FINE':
      return (
        <span
          key={cat}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200"
        >
          Fine
        </span>
      );
    case 'AMENITY':
      return (
        <span
          key={cat}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200"
        >
          Amenity
        </span>
      );
    default:
      return (
        <span
          key={cat}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gray-50 text-gray-600 border border-gray-200"
        >
          {category || 'Other'}
        </span>
      );
  }
};

const getInvoiceUrgency = (inv: Invoice): { label: string; variant: BadgeVariant } => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (!inv.dueDate) {
    return { label: 'Upcoming', variant: 'neutral' };
  }

  const due = new Date(inv.dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (inv.status === 'OVERDUE' || diffDays < 0) {
    const days = Math.max(1, Math.abs(diffDays));
    return {
      label: `Overdue by ${days} day${days === 1 ? '' : 's'}`,
      variant: 'danger',
    };
  }

  if (diffDays <= 3) {
    const days = Math.max(0, diffDays);
    return {
      label: days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
      variant: 'warning',
    };
  }

  return {
    label: `Due on ${formatDate(inv.dueDate)}`,
    variant: 'neutral',
  };
};

const getInvoicePayerInfo = (inv: Invoice, fallbackRole?: string) => {
  const payment = inv.payments && inv.payments.length > 0 ? inv.payments[0] : null;
  const name = payment?.paidByName || null;
  const payerRole = payment?.paidByRole || (payment ? fallbackRole : null);
  const method = payment?.method || (inv.paidAt ? 'Online' : null);
  const amount = payment?.amount ?? inv.amountPaid ?? 0;
  return { name, payerRole, method, amount };
};

export const BillingPage: React.FC = () => {
  const { contexts, activeContext, switchContext } = useRole();
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitContexts = useMemo(() => contexts.filter((c) => c.type === 'UNIT'), [contexts]);
  const unitId = activeContext?.unitId || (activeContext?.type === 'UNIT' ? activeContext.id : '') || '';
  const unitNumber = activeContext?.unitNumber || activeContext?.label || '';
  const buildingName = activeContext?.buildingName || '';
  const societyName = activeContext?.societyName || 'Society';
  const role = (activeContext?.role || '').toUpperCase();

  const unitDisplay = unitNumber
    ? unitNumber.toLowerCase().startsWith('flat')
      ? unitNumber
      : `Flat ${unitNumber}`
    : 'My Flat';

  const locationSubtitle = [unitDisplay, buildingName, societyName].filter(Boolean).join(' • ');

  const roleDescription = useMemo(() => {
    if (role === 'OWNER') {
      return 'Managing maintenance dues and payment records for your owned property.';
    }
    if (role === 'TENANT') {
      return 'Maintenance & utility bills for your rented residence.';
    }
    return 'Maintenance dues, extra charges, and payment history for your unit.';
  }, [role]);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: invoicesData, isLoading, refetch } = useCachedFetch<Invoice[]>(
    INVOICES_KEY(unitId || 'none'),
    () => billingResidentApi.getMyInvoices(unitId),
    { deps: [unitId], skipInitialFetch: !unitId },
  );

  const invoices = useMemo(() => invoicesData ?? [], [invoicesData]);

  const pendingInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) => inv.status === 'PENDING' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE',
      ),
    [invoices],
  );

  const settledInvoices = useMemo(
    () => invoices.filter((inv) => inv.status === 'PAID' || inv.status === 'CANCELLED'),
    [invoices],
  );

  const totalDue = useMemo(
    () => pendingInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.amountPaid)), 0),
    [pendingInvoices],
  );

  const totalSettledAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0),
    [invoices],
  );

  const urgencyAlert = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const overdueList = pendingInvoices.filter((inv) => {
      if (inv.status === 'OVERDUE') return true;
      if (!inv.dueDate) return false;
      const due = new Date(inv.dueDate);
      due.setHours(0, 0, 0, 0);
      return now.getTime() > due.getTime();
    });

    if (overdueList.length > 0) {
      const overdueTotal = overdueList.reduce(
        (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.amountPaid)),
        0,
      );
      const maxDays = Math.max(
        ...overdueList.map((inv) => {
          const due = new Date(inv.dueDate);
          due.setHours(0, 0, 0, 0);
          const diffMs = now.getTime() - due.getTime();
          return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }),
      );
      return {
        badgeText: `${formatMoney(overdueTotal)} Overdue (by ${maxDays} day${maxDays === 1 ? '' : 's'})`,
        subtext: 'Please settle to avoid late penalties',
        variant: 'danger' as BadgeVariant,
        icon: AlertTriangle,
        cardBg: 'bg-rose-50/50 border-rose-200',
        iconBg: 'bg-rose-100 text-rose-600',
      };
    }

    const sortedUpcoming = [...pendingInvoices]
      .filter((inv) => inv.dueDate)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    if (sortedUpcoming.length > 0) {
      const nextBill = sortedUpcoming[0];
      const due = new Date(nextBill.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 3) {
        const daysText = diffDays <= 0 ? 'today' : `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
        return {
          badgeText: `Next bill due ${daysText}`,
          subtext: `${nextBill.periodLabel || nextBill.invoiceNumber}: ${formatMoney(
            Number(nextBill.totalAmount) - Number(nextBill.amountPaid),
          )}`,
          variant: 'warning' as BadgeVariant,
          icon: Clock,
          cardBg: 'bg-amber-50/50 border-amber-200',
          iconBg: 'bg-amber-100 text-amber-600',
        };
      }

      return {
        badgeText: `Next bill due on ${formatDate(nextBill.dueDate)}`,
        subtext: `${nextBill.periodLabel || nextBill.invoiceNumber}: ${formatMoney(
          Number(nextBill.totalAmount) - Number(nextBill.amountPaid),
        )}`,
        variant: 'info' as BadgeVariant,
        icon: Clock,
        cardBg: 'bg-sky-50/50 border-sky-200',
        iconBg: 'bg-sky-100 text-sky-600',
      };
    }

    return {
      badgeText: 'All dues cleared!',
      subtext: 'No pending payments',
      variant: 'success' as BadgeVariant,
      icon: CheckCircle2,
      cardBg: 'bg-emerald-50/50 border-emerald-200',
      iconBg: 'bg-emerald-100 text-emerald-600',
    };
  }, [pendingInvoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter === 'PENDING') {
        const isPending =
          inv.status === 'PENDING' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE';
        if (!isPending) return false;
      } else if (statusFilter === 'SETTLED') {
        const isSettled = inv.status === 'PAID' || inv.status === 'CANCELLED';
        if (!isSettled) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = inv.invoiceNumber?.toLowerCase().includes(q);
        const periodMatch = inv.periodLabel?.toLowerCase().includes(q);
        if (!numMatch && !periodMatch) return false;
      }

      return true;
    });
  }, [invoices, statusFilter, searchQuery]);

  const filteredPending = useMemo(
    () =>
      filteredInvoices.filter(
        (inv) => inv.status === 'PENDING' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE',
      ),
    [filteredInvoices],
  );

  const filteredSettled = useMemo(
    () => filteredInvoices.filter((inv) => inv.status === 'PAID' || inv.status === 'CANCELLED'),
    [filteredInvoices],
  );

  const openDetail = async (invoice: Invoice) => {
    if (!unitId) return;
    setIsLoadingDetail(true);
    try {
      const detail = await billingResidentApi.getInvoice(unitId, invoice.id);
      setSelectedInvoice(detail);
    } catch {
      toastError('Failed to load bill details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handlePayNow = async (invoice: Invoice) => {
    if (!unitId) return;
    setPayingInvoiceId(invoice.id);
    try {
      const order = await billingResidentApi.createPaymentOrder(unitId, invoice.id);
      await openRazorpayCheckout({
        order,
        societyName,
        prefill: { name: user?.name, email: user?.email, contact: user?.phone },
        onSuccess: async (response) => {
          try {
            await billingResidentApi.verifyPayment(unitId, invoice.id, response);
            toastSuccess('Payment successful! Your bill has been updated.');
            await refetch(true);
            setSelectedInvoice(null);
          } catch {
            toastError('Payment completed but could not be verified. Please contact support.');
          } finally {
            setPayingInvoiceId(null);
          }
        },
        onDismiss: () => setPayingInvoiceId(null),
      });
    } catch (err: any) {
      const msg =
        err?.status === 503 || err?.response?.status === 503
          ? 'Online payments are not set up yet for this society. Please contact your admin.'
          : err?.message || 'Could not start payment.';
      toastError(msg);
      setPayingInvoiceId(null);
    }
  };

  const handleDownloadReceipt = async (invoiceId: string) => {
    if (!unitId) return;
    setIsDownloadingReceipt(true);
    try {
      const blob = await billingResidentApi.downloadReceiptPdf(unitId, invoiceId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${selectedInvoice?.invoiceNumber || invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toastSuccess('Receipt downloaded successfully.');
    } catch {
      toastError('Failed to download receipt PDF.');
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const outstanding = selectedInvoice
    ? Number(selectedInvoice.totalAmount) - Number(selectedInvoice.amountPaid)
    : 0;
  const canPaySelected =
    selectedInvoice &&
    (selectedInvoice.status === 'PENDING' ||
      selectedInvoice.status === 'PARTIALLY_PAID' ||
      selectedInvoice.status === 'OVERDUE');

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {/* Landlord Multi-Unit Switcher */}
      {unitContexts.length > 1 && (
        <div className="bg-gray-50/90 p-2.5 rounded-2xl border border-gray-200/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 px-2">
            Units:
          </span>
          <div className="flex items-center gap-2">
            {unitContexts.map((ctx) => {
              const isActive = ctx.id === activeContext?.id;
              const uNum = ctx.unitNumber || ctx.label || 'Unit';
              const bName = ctx.buildingName;
              const ctxRole = ctx.role ? formatRoleName(ctx.role) : '';
              const pillLabel =
                [uNum.toLowerCase().startsWith('flat') ? uNum : `Flat ${uNum}`, bName]
                  .filter(Boolean)
                  .join(' • ') + (ctxRole ? ` (${ctxRole})` : '');

              return (
                <button
                  key={ctx.id}
                  type="button"
                  onClick={() => switchContext(ctx.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[#cd0447] text-white font-bold shadow-xs'
                      : 'bg-white text-gray-700 font-medium border border-gray-200 hover:bg-gray-100 hover:text-gray-900 shadow-2xs'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{pillLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Role-Aware Header */}
      <PageHeader
        eyebrow={locationSubtitle}
        title="My Bills"
        badge={renderRoleBadge(role)}
        subtitle={roleDescription}
      />

      {/* Metrics & Urgency Alert Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total Outstanding */}
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">
              {isLoading ? '...' : formatMoney(totalDue)}
            </div>
            <div className="text-xs font-semibold text-gray-500">
              Total Due Across {pendingInvoices.length} Bill{pendingInvoices.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {/* Urgency Alert Card */}
        <div className={`card p-5 flex items-center gap-4 ${urgencyAlert.cardBg}`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${urgencyAlert.iconBg}`}>
            <urgencyAlert.icon className="w-6 h-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <Badge variant={urgencyAlert.variant} size="sm">
              {urgencyAlert.badgeText}
            </Badge>
            <div className="text-xs font-medium text-gray-600 truncate">
              {urgencyAlert.subtext}
            </div>
          </div>
        </div>

        {/* Settled Bills */}
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">
              {isLoading ? '...' : settledInvoices.filter((i) => i.status === 'PAID').length}
            </div>
            <div className="text-xs font-semibold text-gray-500">
              Bills Paid • {formatMoney(totalSettledAmount)} settled
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <div className="inline-flex p-1 bg-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'ALL'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All ({invoices.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'PENDING'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pending / Due ({pendingInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SETTLED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'SETTLED'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Settled ({settledInvoices.length})
          </button>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice # or period..."
            className="input !text-xs !py-1.5 !pl-9 !pr-8 w-full"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={4} rows={4} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No bills yet"
          description="Your maintenance and other charges will appear here once your admin generates them."
        />
      ) : filteredInvoices.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-gray-700">No matching invoices found</div>
          <div className="text-xs text-gray-500">
            No bills match your current filters or search term &quot;{searchQuery}&quot;.
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn-secondary !text-xs !py-1.5 !px-3"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Invoices Cards */}
          {(statusFilter === 'ALL' || statusFilter === 'PENDING') && filteredPending.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Pending Dues ({filteredPending.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPending.map((inv) => {
                  const urgency = getInvoiceUrgency(inv);
                  const remaining = Number(inv.totalAmount) - Number(inv.amountPaid);
                  const isPartiallyPaid = Number(inv.amountPaid) > 0;
                  const payerInfo = getInvoicePayerInfo(inv, role);
                  const showPayer = isPartiallyPaid || Boolean(payerInfo.name);

                  // Extract line item categories or fallback to MAINTENANCE
                  const categories: string[] =
                    inv.lineItems && inv.lineItems.length > 0
                      ? Array.from(new Set(inv.lineItems.map((li) => li.category).filter(Boolean)))
                      : ['MAINTENANCE'];

                  return (
                    <div
                      key={inv.id}
                      className="card p-5 space-y-4 flex flex-col justify-between hover:border-gray-300 transition-colors"
                    >
                      <div className="space-y-3">
                        {/* Header: Invoice # & Urgency Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-mono font-medium text-gray-500">
                              {inv.invoiceNumber}
                              {inv.periodLabel ? ` • ${inv.periodLabel}` : ''}
                            </div>
                            <div className="text-xl font-bold text-gray-900 mt-0.5">
                              {formatMoney(remaining)}
                              {isPartiallyPaid && (
                                <span className="text-xs font-normal text-gray-500 ml-1.5">
                                  remaining of {formatMoney(inv.totalAmount)}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge variant={urgency.variant} size="sm">
                            {urgency.label}
                          </Badge>
                        </div>

                        {/* Category Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {categories.map((cat) => renderCategoryChip(cat))}
                        </div>

                        {/* Payer Attribution Banner */}
                        {showPayer && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-100 text-xs text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                            <span>
                              Paid {formatMoney(payerInfo.amount || inv.amountPaid)} by{' '}
                              <strong className="font-semibold">
                                {payerInfo.name || (user?.name ? user.name : 'Resident')}
                              </strong>
                              {payerInfo.payerRole ? (
                                <span className="ml-1 text-[11px] font-medium text-emerald-700">
                                  ({formatRoleName(payerInfo.payerRole)})
                                </span>
                              ) : role ? (
                                <span className="ml-1 text-[11px] font-medium text-emerald-700">
                                  ({formatRoleName(role)})
                                </span>
                              ) : null}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => void openDetail(inv)}
                          className="btn-secondary !text-xs !py-1.5 !px-3 flex-1 flex items-center justify-center gap-1.5"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>View & Receipt</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePayNow(inv)}
                          disabled={payingInvoiceId === inv.id}
                          className="btn-primary !text-xs !py-1.5 !px-3 flex-1 flex items-center justify-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{payingInvoiceId === inv.id ? 'Opening...' : 'Pay Now'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Settled Invoices Table */}
          {(statusFilter === 'ALL' || statusFilter === 'SETTLED') && filteredSettled.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Payment History & Settled Bills ({filteredSettled.length})
                </h3>
              </div>
              <div className="card-static overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Period</th>
                        <th>Total Amount</th>
                        <th>Paid Amount</th>
                        <th>Payer</th>
                        <th>Paid On</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSettled.map((inv) => {
                        const payerInfo = getInvoicePayerInfo(inv, role);
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50/80">
                            <td className="text-xs font-mono font-medium text-gray-800">
                              {inv.invoiceNumber}
                            </td>
                            <td className="text-xs text-gray-600">{inv.periodLabel || '—'}</td>
                            <td className="text-xs font-semibold text-gray-900">
                              {formatMoney(inv.totalAmount)}
                            </td>
                            <td className="text-xs font-semibold text-emerald-600">
                              {formatMoney(inv.amountPaid)}
                            </td>
                            <td className="text-xs">
                              {payerInfo.name || payerInfo.method ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-gray-900">
                                    {payerInfo.name || payerInfo.method}
                                  </span>
                                  {payerInfo.payerRole && renderRoleBadge(payerInfo.payerRole)}
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="text-xs text-gray-600">
                              {formatDate(
                                inv.paidAt ||
                                  inv.payments?.[0]?.paidAt ||
                                  inv.payments?.[0]?.createdAt ||
                                  inv.generatedAt,
                              )}
                            </td>
                            <td>
                              <Badge variant={statusVariant(inv.status)} size="sm">
                                {inv.status.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={() => void openDetail(inv)}
                                className="btn-secondary !text-xs !py-1 !px-2.5 inline-flex items-center gap-1.5"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>View & Receipt</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invoice Details & Receipt Modal */}
      <Modal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={
          <div>
            <div className="font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#cd0447]" />
              <span>{selectedInvoice?.invoiceNumber}</span>
            </div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">
              {selectedInvoice?.periodLabel || 'Invoice Breakdown'}
            </div>
          </div>
        }
      >
        {isLoadingDetail ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading bill details...</div>
        ) : selectedInvoice ? (
          <div className="space-y-5">
            {/* Charges Breakdown */}
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Charges Breakdown
              </div>
              {(selectedInvoice.lineItems || []).length > 0 ? (
                (selectedInvoice.lineItems || []).map((li) => (
                  <div key={li.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="space-y-0.5">
                      <div className="font-medium text-gray-900">{li.description}</div>
                      <div className="pt-0.5">{renderCategoryChip(li.category)}</div>
                    </div>
                    <div className="font-semibold text-gray-900">{formatMoney(li.amount)}</div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-3 text-xs text-gray-500 italic">
                  Standard recurring maintenance assessment
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <div className="text-sm font-bold text-gray-900">Total Invoiced</div>
                <div className="text-sm font-bold text-gray-900">
                  {formatMoney(selectedInvoice.totalAmount)}
                </div>
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-[11px] text-gray-500 font-medium">Paid</div>
                <div className="text-sm font-bold text-emerald-600">
                  {formatMoney(selectedInvoice.amountPaid)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-[11px] text-gray-500 font-medium">Outstanding</div>
                <div className="text-sm font-bold text-rose-600">{formatMoney(outstanding)}</div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-[11px] text-gray-500 font-medium">Due Date</div>
                <div className="text-sm font-bold text-gray-900">
                  {formatDate(selectedInvoice.dueDate)}
                </div>
              </div>
            </div>

            {/* Payments & Payer Attribution */}
            {(selectedInvoice.payments || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Payment Records
                </div>
                <div className="space-y-2">
                  {(selectedInvoice.payments || []).map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900">
                            {p.paidByName || 'Resident'}
                          </span>
                          {p.paidByRole && renderRoleBadge(p.paidByRole)}
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-600">{p.method}</span>
                        </div>
                        <span className="font-bold text-emerald-600">{formatMoney(p.amount)}</span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {formatDate(p.paidAt || p.createdAt)}
                        {p.note && ` • Note: ${p.note}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {(Number(selectedInvoice.amountPaid) > 0 || selectedInvoice.status === 'PAID') && (
                <button
                  type="button"
                  onClick={() => void handleDownloadReceipt(selectedInvoice.id)}
                  disabled={isDownloadingReceipt}
                  className="btn-secondary w-full flex items-center justify-center gap-2 !text-xs !py-2.5"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {isDownloadingReceipt
                      ? 'Downloading...'
                      : 'Download Official Receipt (PDF)'}
                  </span>
                </button>
              )}

              {canPaySelected && (
                <button
                  type="button"
                  onClick={() => void handlePayNow(selectedInvoice)}
                  disabled={payingInvoiceId === selectedInvoice.id}
                  className="btn-primary w-full flex items-center justify-center gap-2 !text-xs !py-2.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {payingInvoiceId === selectedInvoice.id
                      ? 'Opening...'
                      : `Pay ${formatMoney(outstanding)} Now`}
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default BillingPage;
