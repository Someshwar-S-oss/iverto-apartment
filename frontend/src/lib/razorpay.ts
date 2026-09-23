import type { RazorpayOrder } from '../api/types';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// Deliberately not an npm SDK — Razorpay Checkout is a script-injected modal, the
// standard integration shape for it. Cached so "Pay Now" on a second invoice doesn't
// re-fetch/re-inject the script.
let scriptLoadPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('Could not load the Razorpay checkout script. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface OpenCheckoutOptions {
  order: RazorpayOrder;
  /** Shown as the merchant name in the checkout modal. */
  societyName: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (response: RazorpaySuccessResponse) => void;
  /** Fired when the resident closes the modal without completing payment. */
  onDismiss?: () => void;
}

/**
 * Loads Razorpay's Checkout.js (if not already loaded) and opens the payment modal for
 * an order our backend already created. Requires the backend to have real (even
 * free/test-mode) Razorpay keys configured — otherwise POST .../pay/order 503s before
 * this is ever called; see billing-resident.api.ts's createPaymentOrder.
 */
export async function openRazorpayCheckout(options: OpenCheckoutOptions): Promise<void> {
  await loadCheckoutScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout failed to initialize.');
  }

  const checkout = new window.Razorpay({
    key: options.order.keyId,
    amount: options.order.amount,
    currency: options.order.currency,
    order_id: options.order.orderId,
    name: options.societyName,
    description: `Invoice ${options.order.invoiceNumber}`,
    prefill: options.prefill,
    theme: { color: '#cd0447' },
    handler: (response: RazorpaySuccessResponse) => options.onSuccess(response),
    modal: {
      ondismiss: options.onDismiss,
    },
  });

  checkout.open();
}
