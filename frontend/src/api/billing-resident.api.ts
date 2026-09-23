import apiClient from './client';
import type { Invoice, RazorpayOrder } from './types';

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const billingResidentApi = {
  /** Calls GET /api/v1/mobile/units/:unitId/billing/invoices. */
  getMyInvoices: async (unitId: string): Promise<Invoice[]> => {
    const response = await apiClient.get<Invoice[]>(
      `/api/v1/mobile/units/${unitId}/billing/invoices`,
    );
    return response.data;
  },

  /** Calls GET /api/v1/mobile/units/:unitId/billing/invoices/:id. */
  getInvoice: async (unitId: string, invoiceId: string): Promise<Invoice> => {
    const response = await apiClient.get<Invoice>(
      `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}`,
    );
    return response.data;
  },

  /**
   * Creates a Razorpay order for the invoice's outstanding balance. Throws (503) if the
   * gateway isn't configured with real keys yet — see razorpay.ts for how the caller
   * should present that.
   * Calls POST /api/v1/mobile/units/:unitId/billing/invoices/:id/pay/order.
   */
  createPaymentOrder: async (unitId: string, invoiceId: string): Promise<RazorpayOrder> => {
    const response = await apiClient.post<RazorpayOrder>(
      `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/pay/order`,
    );
    return response.data;
  },

  /**
   * Confirms a completed Razorpay checkout by verifying its signature server-side.
   * Calls POST /api/v1/mobile/units/:unitId/billing/invoices/:id/pay/verify.
   */
  verifyPayment: async (
    unitId: string,
    invoiceId: string,
    data: VerifyPaymentPayload,
  ): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>(
      `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/pay/verify`,
      data,
    );
    return response.data;
  },

  /** Returns the direct URL for streaming the receipt PDF. */
  getReceiptPdfUrl: (unitId: string, invoiceId: string): string =>
    `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,

  /** Alias for getReceiptPdfUrl. */
  getReceiptUrl: (unitId: string, invoiceId: string): string =>
    `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,

  /** Downloads the receipt PDF as a Blob. */
  downloadReceiptPdf: async (unitId: string, invoiceId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,
      { responseType: 'blob' },
    );
    return response.data;
  },
};

export default billingResidentApi;
