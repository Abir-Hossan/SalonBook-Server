import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppointmentModel } from '../../database/models/appointment.model';
import { TransactionModel } from '../../database/models/transaction.model';
import { authenticate, authorize } from '../../middleware/auth';
import { mongoPrincipalResolver } from '../auth/auth.routes';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/errors';
import { success } from '../../utils/http';

const idSchema = z.string().regex(/^[a-f0-9]{24}$/i);
const sessionSchema = z.object({
  id: z.string().startsWith('cs_'),
  url: z.string().url().nullish(),
  status: z.enum(['open', 'complete', 'expired']),
  payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']),
  amount_total: z.number().int(),
  currency: z.string(),
  metadata: z.object({ appointmentId: idSchema, attempt: z.string().uuid() }),
  livemode: z.literal(false),
});

function isConfigured() {
  return /^(?:sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? '') && /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET ?? '');
}

function configured() {
  if (!isConfigured()) {
    throw new AppError(503, 'Online payments are currently unavailable.', 'STRIPE_UNAVAILABLE');
  }
}

class StripeRequestError extends AppError {
  constructor(readonly providerStatus: number) {
    super(502, 'Checkout could not be reached. Try again.', 'STRIPE_REQUEST_FAILED');
  }
}

async function stripe(path: string, init: RequestInit = {}) {
  configured();
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions' + path, {
    ...init, signal: AbortSignal.timeout(12_000),
    headers: { ...init.headers, Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY },
  });
  if (!response.ok) throw new StripeRequestError(response.status);
  return sessionSchema.parse(await response.json());
}

function verifySignature(body: Buffer, header: string) {
  const fields = header.split(',').map((part) => part.trim());
  const timestamp = fields.find((item) => item.startsWith('t='))?.slice(2) ?? '';
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET!).update(timestamp + '.').update(body).digest();
  return fields.some((field) => /^v1=[a-f0-9]{64}$/.test(field) && timingSafeEqual(expected, Buffer.from(field.slice(3), 'hex')));
}

async function recordPayment(checkout: z.infer<typeof sessionSchema>) {
  const appointmentId = checkout.metadata.appointmentId;
  const attempt = checkout.metadata.attempt;
  if (checkout.status === 'expired') {
    await AppointmentModel.updateOne({ _id: appointmentId, checkoutAttempt: attempt, paymentStatus: 'unpaid', $or: [{ checkoutSessionId: checkout.id }, { checkoutSessionId: { $exists: false } }] },
      { $unset: { checkoutAttempt: '', checkoutStartedAt: '', checkoutSessionId: '' } });
    return;
  }
  if (checkout.status !== 'complete' || checkout.payment_status !== 'paid') return;
  await mongoose.connection.transaction(async (session) => {
    const booking = await AppointmentModel.findOne({ _id: appointmentId, checkoutAttempt: attempt, $or: [{ checkoutSessionId: checkout.id }, { checkoutSessionId: { $exists: false } }] }).session(session);
    if (!booking || booking.paymentStatus === 'paid') return;
    if (booking.status !== 'confirmed' || checkout.currency !== 'usd' || checkout.amount_total !== Math.round(booking.servicePrice * 100)) {
      throw new AppError(409, 'Payment does not match the appointment.', 'PAYMENT_MISMATCH');
    }
    await TransactionModel.updateOne({ stripeSessionId: checkout.id }, { $setOnInsert: {
      appointmentId: booking._id, customerId: booking.customerId, amount: booking.servicePrice, currency: 'USD', status: 'paid',
    } }, { upsert: true, session });
    await AppointmentModel.updateOne({ _id: booking._id, checkoutAttempt: attempt }, { $set: { paymentStatus: 'paid', checkoutSessionId: checkout.id } }, { session });
  });
}

export const stripeWebhook = [
  express.raw({ type: 'application/json', limit: '256kb' }),
  asyncHandler(async (req, res) => {
    configured();
    if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.get('stripe-signature') ?? '')) {
      throw new AppError(400, 'Invalid payment notification signature.', 'INVALID_STRIPE_SIGNATURE');
    }
    const event = z.object({ type: z.string(), data: z.object({ object: z.unknown() }) }).parse(JSON.parse(req.body.toString('utf8')));
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)) {
      const checkout = sessionSchema.safeParse(event.data.object);
      if (!checkout.success) {
        logger.warn({ eventType: event.type }, 'Rejected a Stripe test event with an invalid checkout payload');
        throw new AppError(400, 'Invalid checkout notification data.', 'INVALID_STRIPE_EVENT');
      }
      await recordPayment(checkout.data);
    }
    res.status(204).end();
  }),
];

export function paymentRoutes() {
  const router = Router();
  const customer = [authenticate(mongoPrincipalResolver), authorize('customer')];
  router.post('/release-checkout', authenticate(mongoPrincipalResolver), authorize('admin'), asyncHandler(async (req, res) => {
    configured();
    const { appointmentId } = z.object({ appointmentId: idSchema }).strict().parse(req.body);
    const appointment = await AppointmentModel.findOne({ _id: appointmentId, paymentStatus: 'unpaid', checkoutAttempt: { $exists: true } });
    if (!appointment?.checkoutSessionId) {
      throw new AppError(409, 'No recorded Checkout session can be released. Reconcile the attempt in Stripe first.', 'CHECKOUT_RECONCILIATION_REQUIRED');
    }
    const path = '/' + encodeURIComponent(appointment.checkoutSessionId);
    let checkout = await stripe(path);
    if (checkout.metadata.appointmentId !== String(appointment._id) || checkout.metadata.attempt !== appointment.checkoutAttempt) {
      throw new AppError(409, 'Checkout does not match the appointment.', 'PAYMENT_MISMATCH');
    }
    if (checkout.status === 'open') {
      try {
        checkout = await stripe(path + '/expire', { method: 'POST' });
      } catch (error) {
        if (!(error instanceof StripeRequestError) || error.providerStatus !== 400) throw error;
        checkout = await stripe(path);
      }
    }
    if (checkout.status !== 'expired') {
      throw new AppError(409, 'Checkout has completed. Reconcile the payment and review the appointment.', 'CHECKOUT_COMPLETED');
    }
    await recordPayment(checkout);
    success(res, 'Checkout released.');
  }));
  router.get('/availability', ...customer, (_req, res) => success(res, 'Payment availability.', { stripe: isConfigured() }));
  router.post('/checkout', ...customer, asyncHandler(async (req, res) => {
    configured();
    const { appointmentId } = z.object({ appointmentId: idSchema }).strict().parse(req.body);
    const filter = { _id: appointmentId, customerId: req.principal!.id, status: 'confirmed', paymentStatus: 'unpaid' };
    const reserved = await AppointmentModel.findOneAndUpdate({ ...filter, checkoutAttempt: { $exists: false } },
      { $set: { checkoutAttempt: randomUUID(), checkoutStartedAt: new Date() } }, { new: true });
    const booking = reserved ?? await AppointmentModel.findOne(filter);
    if (!booking?.checkoutAttempt) throw new AppError(422, 'Only confirmed unpaid appointments can be paid.', 'PAYMENT_NOT_ELIGIBLE');
    const redirectBase = new URL(env.CLIENT_URL);
    const bookingId = String(booking._id);
    let checkout;
    if (booking.checkoutSessionId) {
      checkout = await stripe('/' + encodeURIComponent(booking.checkoutSessionId));
    } else {
      if (!booking.checkoutStartedAt || Date.now() - booking.checkoutStartedAt.getTime() >= 23 * 60 * 60 * 1000) {
        throw new AppError(409, 'The previous checkout needs to be reconciled. Contact the concierge.', 'CHECKOUT_RECONCILIATION_REQUIRED');
      }
      const params = new URLSearchParams({
        mode: 'payment', 'payment_method_types[0]': 'card',
        success_url: new URL('/payment/success?appointment=' + bookingId, redirectBase).href,
        cancel_url: new URL('/payment/cancel', redirectBase).href,
        'metadata[appointmentId]': bookingId, 'metadata[attempt]': booking.checkoutAttempt,
        'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(Math.round(booking.servicePrice * 100)),
        'line_items[0][price_data][product_data][name]': 'SalonBook appointment',
      });
      try {
        checkout = await stripe('', { method: 'POST', headers: { 'Idempotency-Key': booking.checkoutAttempt }, body: params });
      } catch (error) {
        if (error instanceof StripeRequestError && [400, 401, 403].includes(error.providerStatus)) {
          await AppointmentModel.updateOne({
            _id: booking._id, checkoutAttempt: booking.checkoutAttempt, checkoutSessionId: { $exists: false }, paymentStatus: 'unpaid',
          }, { $unset: { checkoutAttempt: '', checkoutStartedAt: '' } });
        }
        throw error;
      }
      await AppointmentModel.updateOne({ _id: booking._id, checkoutAttempt: booking.checkoutAttempt }, { $set: { checkoutSessionId: checkout.id } });
    }
    if (checkout.status !== 'open' || !checkout.url) {
      if (checkout.status === 'expired') await recordPayment(checkout);
      throw new AppError(409, 'This checkout has closed. Refresh your appointments for the latest status.', 'CHECKOUT_CLOSED');
    }
    if (new URL(checkout.url).hostname !== 'checkout.stripe.com' || !checkout.url.startsWith('https://')) {
      throw new AppError(502, 'The payment link could not be verified.', 'INVALID_CHECKOUT_URL');
    }
    success(res, 'Checkout created.', { url: checkout.url });
  }));
  return router;
}
