/**
 * app/api/pricing/plans/route.ts
 *
 * Pricing Plans API
 * Manage pricing plans for SaaS and proposal products
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { PricingPlanConfig, PricingService } from '@/lib/stripe/pricingService';
import { runWithTenantBypass } from '@/lib/tenant/context';

/**
 * Query params schema for GET requests
 */
const pricingQuerySchema = z.object({
  type: z.enum(['saas', 'proposal']).optional().nullable(),
  id: z.string().optional().nullable(),
});

/**
 * Basic plan schema for POST requests - minimal validation, service handles the rest
 */
const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['saas', 'proposal']),
  priceCents: z.number().positive(),
  interval: z.enum(['month', 'year']),
});

/**
 * Update plan schema for PUT requests
 */
const updatePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  priceCents: z.number().positive().optional(),
  active: z.boolean().optional(),
});

/**
 * Inner handler for GET pricing plans
 */
async function handleGetPlans(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') as 'saas' | 'proposal' | null;
    const planId = url.searchParams.get('id');

    // Validate query params
    const result = pricingQuerySchema.safeParse({ type, id: planId });
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    if (planId) {
      // Get specific plan by ID — pricing plans are global system data, bypass RLS
      const plan = await runWithTenantBypass('pricing-plans-get-by-id', () =>
        PricingService.getPricingPlanById(planId)
      );
      if (!plan) {
        return NextResponse.json(
          new NotFoundError('Pricing plan', planId).toEnvelope(req.url, traceId),
          { status: 404 }
        );
      }
      const response = NextResponse.json(plan);
      response.headers.set('X-Trace-Id', traceId);
      return response;
    } else if (type) {
      // Get plans by type — pricing plans are global system data, bypass RLS
      const plans = await runWithTenantBypass('pricing-plans-get-by-type', () =>
        PricingService.getPricingPlans(type)
      );
      const response = NextResponse.json(plans);
      response.headers.set('X-Trace-Id', traceId);
      return response;
    } else {
      // Get all active plans — pricing plans are global system data, bypass RLS
      const [saasPlans, proposalPlans] = await runWithTenantBypass('pricing-plans-get-all', () =>
        Promise.all([
          PricingService.getPricingPlans('saas'),
          PricingService.getPricingPlans('proposal'),
        ])
      );
      const response = NextResponse.json({ saas: saasPlans, proposal: proposalPlans });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    }
  } catch (error) {
    console.error('Error fetching pricing plans:', error);
    const internalError = new InternalError('Failed to fetch pricing plans', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for POST create plan
 */
async function handleCreatePlan(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = createPlanSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid plan data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const plan = result.data as unknown as PricingPlanConfig;

    const createdPlan = await PricingService.createPricingPlan(plan);
    const response = NextResponse.json(createdPlan, { status: 201 });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Error creating pricing plan:', error);
    const internalError = new InternalError('Failed to create pricing plan', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for PUT update plan
 */
async function handleUpdatePlan(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = updatePlanSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid update data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { id, ...updates } = result.data;

    const updatedPlan = await PricingService.updatePricingPlan(
      id,
      updates as Partial<PricingPlanConfig>
    );
    const response = NextResponse.json(updatedPlan);
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Error updating pricing plan:', error);
    const internalError = new InternalError('Failed to update pricing plan', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for PATCH sync with Stripe
 */
async function handleSyncWithStripe(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const planId = url.searchParams.get('id');
    const action = url.searchParams.get('action');

    if (!planId) {
      const planIdError = new NotFoundError('Plan ID required');
      planIdError.details = [{ field: 'id', message: 'Plan ID is required' }];
      return NextResponse.json(planIdError.toEnvelope(req.url, traceId), { status: 400 });
    }

    switch (action) {
      case 'sync-stripe':
        await PricingService.syncWithStripe(planId);
        const response = NextResponse.json({ message: 'Successfully synced with Stripe' });
        response.headers.set('X-Trace-Id', traceId);
        return response;
      default:
        const actionError = new NotFoundError('Invalid action');
        actionError.details = [{ field: 'action', message: 'Invalid action specified' }];
        return NextResponse.json(actionError.toEnvelope(req.url, traceId), { status: 400 });
    }
  } catch (error) {
    console.error('Error in patch operation:', error);
    const internalError = new InternalError('Failed to sync with Stripe', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many pricing requests. Please wait before trying again.',
  })(req, () => handleGetPlans(req));

const rateLimitedPost = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many plan creation requests. Please wait before trying again.',
  })(req, () => handleCreatePlan(req));

const rateLimitedPut = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many plan update requests. Please wait before trying again.',
  })(req, () => handleUpdatePlan(req));

const rateLimitedPatch = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many sync requests. Please wait before trying again.',
  })(req, () => handleSyncWithStripe(req));

export const GET = rateLimitedGet;
export const POST = rateLimitedPost;
export const PUT = rateLimitedPut;
export const PATCH = rateLimitedPatch;
