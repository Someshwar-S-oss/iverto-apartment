import apiClient from './client';
import type {
  AdhocCharge,
  AdhocChargeStatus,
  BillingDashboardSummary,
  BillingPlan,
  BillingSettings,
  ChargeCategory,
  ChargeTiming,
  ChargeType,
  Invoice,
  InvoiceStatus,
  RecordManualPaymentPayload,
  UnitBillingPlanAssignment,
} from './types';

export type { RecordManualPaymentPayload };

export interface CreateBillingPlanPayload {
  name: string;
  amount: number;
  description?: string;
}

export interface UpdateBillingPlanPayload {
  name?: string;
  amount?: number;
  description?: string;
  isActive?: boolean;
}

export interface UpdateBillingSettingsPayload {
  dueDayOfMonth?: number;
  reminderDaysBeforeDue?: number;
}

export interface CreateChargeTypePayload {
  name: string;
  category?: ChargeCategory;
  defaultAmount?: number;
}

export interface CreateAdhocChargePayload {
  title: string;
  amount: number;
  category?: ChargeCategory;
  timing: ChargeTiming;
  chargeTypeId?: string;
  dueDateOverride?: string;
  unitIds?: string[];
  billingPlanId?: string;
  allUnitsInSociety?: boolean;
}

export interface GenerateBillsResult {
  cycleId: string;
  periodLabel: string;
  invoicesCreated: number;
  invoicesTouched: number;
}

export const billingAdminApi = {
  /** Calls GET /api/v1/web/societies/:societyId/billing/dashboard. */
  getDashboard: async (societyId: string): Promise<BillingDashboardSummary> => {
    const response = await apiClient.get<BillingDashboardSummary>(
      `/api/v1/web/societies/${societyId}/billing/dashboard`,
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/settings. */
  getSettings: async (societyId: string): Promise<BillingSettings> => {
    const response = await apiClient.get<BillingSettings>(
      `/api/v1/web/societies/${societyId}/billing/settings`,
    );
    return response.data;
  },

  /** Calls PATCH /api/v1/web/societies/:societyId/billing/settings. */
  updateSettings: async (societyId: string, data: UpdateBillingSettingsPayload): Promise<BillingSettings> => {
    const response = await apiClient.patch<BillingSettings>(
      `/api/v1/web/societies/${societyId}/billing/settings`,
      data,
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/plans. */
  getPlans: async (societyId: string): Promise<BillingPlan[]> => {
    const response = await apiClient.get<BillingPlan[]>(
      `/api/v1/web/societies/${societyId}/billing/plans`,
    );
    return response.data;
  },

  /** Calls POST /api/v1/web/societies/:societyId/billing/plans. */
  createPlan: async (societyId: string, data: CreateBillingPlanPayload): Promise<BillingPlan> => {
    const response = await apiClient.post<BillingPlan>(
      `/api/v1/web/societies/${societyId}/billing/plans`,
      data,
    );
    return response.data;
  },

  /** Calls PATCH /api/v1/web/societies/:societyId/billing/plans/:id. */
  updatePlan: async (societyId: string, planId: string, data: UpdateBillingPlanPayload): Promise<BillingPlan> => {
    const response = await apiClient.patch<BillingPlan>(
      `/api/v1/web/societies/${societyId}/billing/plans/${planId}`,
      data,
    );
    return response.data;
  },

  /** Bulk-assigns a list of units to a slab. Calls POST .../billing/plans/:id/assign-units. */
  assignUnitsToPlan: async (societyId: string, planId: string, unitIds: string[]): Promise<unknown> => {
    const response = await apiClient.post(
      `/api/v1/web/societies/${societyId}/billing/plans/${planId}/assign-units`,
      { unitIds },
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/unit-assignments. */
  getUnitAssignments: async (societyId: string): Promise<UnitBillingPlanAssignment[]> => {
    const response = await apiClient.get<UnitBillingPlanAssignment[]>(
      `/api/v1/web/societies/${societyId}/billing/unit-assignments`,
    );
    return response.data;
  },

  /** Calls DELETE /api/v1/web/societies/:societyId/billing/units/:unitId/plan. */
  unassignUnitPlan: async (societyId: string, unitId: string): Promise<{ unassigned: boolean }> => {
    const response = await apiClient.delete<{ unassigned: boolean }>(
      `/api/v1/web/societies/${societyId}/billing/units/${unitId}/plan`,
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/charge-types. */
  getChargeTypes: async (societyId: string): Promise<ChargeType[]> => {
    const response = await apiClient.get<ChargeType[]>(
      `/api/v1/web/societies/${societyId}/billing/charge-types`,
    );
    return response.data;
  },

  /** Calls POST /api/v1/web/societies/:societyId/billing/charge-types. */
  createChargeType: async (societyId: string, data: CreateChargeTypePayload): Promise<ChargeType> => {
    const response = await apiClient.post<ChargeType>(
      `/api/v1/web/societies/${societyId}/billing/charge-types`,
      data,
    );
    return response.data;
  },

  /** Calls DELETE /api/v1/web/societies/:societyId/billing/charge-types/:id. */
  deleteChargeType: async (societyId: string, id: string): Promise<{ deleted: boolean }> => {
    const response = await apiClient.delete<{ deleted: boolean }>(
      `/api/v1/web/societies/${societyId}/billing/charge-types/${id}`,
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/charges. */
  getCharges: async (
    societyId: string,
    filters: { unitId?: string; status?: AdhocChargeStatus } = {},
  ): Promise<AdhocCharge[]> => {
    const response = await apiClient.get<AdhocCharge[]>(
      `/api/v1/web/societies/${societyId}/billing/charges`,
      { params: filters },
    );
    return response.data;
  },

  /**
   * Raises an ad hoc charge against one unit, every unit on a slab, or the whole
   * society (exactly one of unitIds/billingPlanId/allUnitsInSociety in the payload).
   * Calls POST /api/v1/web/societies/:societyId/billing/charges.
   */
  createCharge: async (societyId: string, data: CreateAdhocChargePayload): Promise<AdhocCharge[]> => {
    const response = await apiClient.post<AdhocCharge[]>(
      `/api/v1/web/societies/${societyId}/billing/charges`,
      data,
    );
    return response.data;
  },

  /** Calls POST /api/v1/web/societies/:societyId/billing/charges/:id/cancel. */
  cancelCharge: async (societyId: string, id: string): Promise<AdhocCharge> => {
    const response = await apiClient.post<AdhocCharge>(
      `/api/v1/web/societies/${societyId}/billing/charges/${id}/cancel`,
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/invoices. */
  getInvoices: async (
    societyId: string,
    filters: { unitId?: string; status?: InvoiceStatus; cycleId?: string } = {},
  ): Promise<Invoice[]> => {
    const response = await apiClient.get<Invoice[]>(
      `/api/v1/web/societies/${societyId}/billing/invoices`,
      { params: filters },
    );
    return response.data;
  },

  /** Calls GET /api/v1/web/societies/:societyId/billing/invoices/:id. */
  getInvoice: async (societyId: string, id: string): Promise<Invoice> => {
    const response = await apiClient.get<Invoice>(
      `/api/v1/web/societies/${societyId}/billing/invoices/${id}`,
    );
    return response.data;
  },

  /** Calls POST /api/v1/web/societies/:societyId/billing/invoices/:id/void. */
  voidInvoice: async (societyId: string, id: string): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>(
      `/api/v1/web/societies/${societyId}/billing/invoices/${id}/void`,
    );
    return response.data;
  },

  /** Records a cash/cheque payment collected outside Razorpay. Calls POST .../manual-payment. */
  recordManualPayment: async (
    societyId: string,
    invoiceId: string,
    data: RecordManualPaymentPayload,
  ): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>(
      `/api/v1/web/societies/${societyId}/billing/invoices/${invoiceId}/manual-payment`,
      data,
    );
    return response.data;
  },

  /**
   * Manually triggers this month's combined-bill generation early, instead of waiting
   * for the 1st-of-month cron. Calls POST /api/v1/web/societies/:societyId/billing/generate.
   */
  generateBills: async (societyId: string): Promise<GenerateBillsResult> => {
    const response = await apiClient.post<GenerateBillsResult>(
      `/api/v1/web/societies/${societyId}/billing/generate`,
    );
    return response.data;
  },

  /**
   * Downloads the billing ledger (who's paid, who hasn't, balances, due dates) as a file.
   * Calls GET /api/v1/web/societies/:societyId/billing/reports/export.
   */
  exportReport: async (
    societyId: string,
    format: 'csv' | 'pdf',
    cycleId?: string,
  ): Promise<Blob> => {
    const response = await apiClient.get(
      `/api/v1/web/societies/${societyId}/billing/reports/export`,
      { params: { format, cycleId }, responseType: 'blob' },
    );
    return response.data;
  },
};

export default billingAdminApi;
