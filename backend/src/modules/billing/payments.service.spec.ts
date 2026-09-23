import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';

describe('PaymentsService.verifySignature', () => {
  const secret = 'test_webhook_secret';
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  function sign(oid: string, pid: string, key: string): string {
    return crypto.createHmac('sha256', key).update(`${oid}|${pid}`).digest('hex');
  }

  it('accepts a correctly signed order/payment pair', () => {
    const signature = sign(orderId, paymentId, secret);
    expect(PaymentsService.verifySignature(orderId, paymentId, signature, secret)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const signature = sign(orderId, paymentId, 'a_different_secret');
    expect(PaymentsService.verifySignature(orderId, paymentId, signature, secret)).toBe(false);
  });

  it('rejects a signature for a tampered orderId', () => {
    const signature = sign(orderId, paymentId, secret);
    expect(PaymentsService.verifySignature('order_TAMPERED', paymentId, signature, secret)).toBe(false);
  });

  it('rejects a signature for a tampered paymentId', () => {
    const signature = sign(orderId, paymentId, secret);
    expect(PaymentsService.verifySignature(orderId, 'pay_TAMPERED', signature, secret)).toBe(false);
  });

  it('rejects an empty/missing signature', () => {
    expect(PaymentsService.verifySignature(orderId, paymentId, '', secret)).toBe(false);
  });

  it('rejects when no secret is configured, even against a correctly-shaped signature', () => {
    const signature = sign(orderId, paymentId, secret);
    expect(PaymentsService.verifySignature(orderId, paymentId, signature, '')).toBe(false);
  });

  it('does not throw on a signature of a different length than expected (timing-safe compare guard)', () => {
    expect(PaymentsService.verifySignature(orderId, paymentId, 'short', secret)).toBe(false);
  });
});
