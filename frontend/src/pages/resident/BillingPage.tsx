import React, { useMemo, useState } from 'react';
import { Wallet, Receipt, CheckCircle2, AlertTriangle, Clock, CreditCard } from 'lucide-react';
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

export const BillingPage: React.FC = () => {
  const { activeContext } = useRole();
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const unitId = activeContext?.unitId || (activeContext?.type === 'UNIT' ? activeContext.id : '') || '';
  const societyName = activeContext?.societyName || 'Society';

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const { data: invoicesData, isLoading, refetch } = useCachedFetch<Invoice[]>(
    INVOICES_KEY(unitId || 'none'),
    () => billingResidentApi.getMyInvoices(unitId),
    { deps: [unitId], skipInitialFetch: !unitId },
  );

  const invoices = useMemo(() => invoicesData ?? [], [invoicesData]);

  const pendingInvoices = useMemo(
    () => invoices.filter((inv) => inv.status === 'PENDING' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE'),
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

  const outstanding = selectedInvoice ? Number(selectedInvoice.totalAmount) - Number(selectedInvoice.amountPaid) : 0;
  const canPaySelected =
    selectedInvoice && (selectedInvoice.status === 'PENDING' || selectedInvoice.status === 'PARTIALLY_PAID' || selectedInvoice.status === 'OVERDUE');

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      <PageHeader
        title="My Bills"
        subtitle="Maintenance dues, extra charges, and payment history for your unit"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">{isLoading ? '...' : formatMoney(totalDue)}</div>
            <div className="text-xs font-semibold text-gray-500">Total Due Across {pendingInvoices.length} Bill(s)</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">{isLoading ? '...' : settledInvoices.filter((i) => i.status === 'PAID').length}</div>
            <div className="text-xs font-semibold text-gray-500">Bills Paid</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={4} rows={4} />
      ) : invoices.length === 0 ? (
        <EmptyState icon={Wallet} title="No bills yet" description="Your maintenance and other charges will appear here once your admin generates them." />
      ) : (
        <div className="space-y-6">
          {pendingInvoices.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900">Pending</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingInvoices.map((inv) => (
                  <div key={inv.id} className="card p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-mono text-gray-400">{inv.invoiceNumber}</div>
                          <div className="text-lg font-bold text-gray-900">{formatMoney(Number(inv.totalAmount) - Number(inv.amountPaid))}</div>
                        </div>
                        <Badge variant={statusVariant(inv.status)} size="sm">{inv.status.replace('_', ' ')}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Due {formatDate(inv.dueDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void openDetail(inv)} className="btn-secondary !text-xs !py-1.5 !px-3 flex-1">
                        View Details
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
                ))}
              </div>
            </div>
          )}

          {settledInvoices.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900">History</h3>
              <div className="card-static overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Period</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settledInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50/80">
                          <td className="text-xs font-mono text-gray-700">{inv.invoiceNumber}</td>
                          <td className="text-xs text-gray-600">{inv.periodLabel}</td>
                          <td className="text-xs font-semibold text-gray-900">{formatMoney(inv.totalAmount)}</td>
                          <td><Badge variant={statusVariant(inv.status)} size="sm">{inv.status}</Badge></td>
                          <td className="text-right">
                            <button type="button" onClick={() => void openDetail(inv)} className="btn-secondary !text-xs !py-1 !px-2.5">
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={
          <div>
            <div className="font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#cd0447]" />
              {selectedInvoice?.invoiceNumber}
            </div>
            <div className="text-xs text-gray-500 font-normal mt-0.5">{selectedInvoice?.periodLabel}</div>
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

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-xs text-gray-500">Paid</div>
                <div className="text-sm font-bold text-emerald-600">{formatMoney(selectedInvoice.amountPaid)}</div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="text-xs text-gray-500">Due Date</div>
                <div className="text-sm font-bold text-gray-900">{formatDate(selectedInvoice.dueDate)}</div>
              </div>
            </div>

            {(selectedInvoice.payments || []).length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">Payment History</div>
                <div className="space-y-1.5">
                  {(selectedInvoice.payments || []).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-gray-50">
                      <span className="text-gray-600">{p.method} • {formatDate(p.paidAt || p.createdAt)}</span>
                      <span className="font-semibold text-gray-900">{formatMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canPaySelected && (
              <button
                type="button"
                onClick={() => void handlePayNow(selectedInvoice)}
                disabled={payingInvoiceId === selectedInvoice.id}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>{payingInvoiceId === selectedInvoice.id ? 'Opening...' : `Pay ${formatMoney(outstanding)} Now`}</span>
              </button>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default BillingPage;
