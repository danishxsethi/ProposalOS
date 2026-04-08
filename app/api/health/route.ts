/**
 * Health Check Endpoint
 *
 * Comprehensive health monitoring for the autonomous delivery engine.
 * Provides liveness and readiness probes for container orchestration.
 *
 * Requirements: Health checks, monitoring, alerting on failures
 */

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

/**
 * Health check response structure
 */
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheck;
    cron: HealthCheck;
    queue: HealthCheck;
    externalApis: HealthCheck;
  };
  metrics?: {
    dlqCount: number;
    openCircuits: number;
    queuedJobs: number;
  };
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;

    // Check if any critical tables are accessible
    const [tenantCount, prospectCount] = await Promise.all([
      prisma.tenant.count().catch(() => -1),
      prisma.prospectLead.count().catch(() => -1),
    ]);

    if (tenantCount >= 0 && prospectCount >= 0) {
      return {
        status: 'healthy',
        latency,
        details: { tenantCount, prospectCount },
      };
    }

    return {
      status: 'degraded',
      latency,
      message: 'Some tables inaccessible',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check if cron jobs are running (based on recent activity)
 */
async function checkCron(): Promise<HealthCheck> {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Check for recent pipeline activity
    const recentTransitions = await prisma.prospectStateTransition.count({
      where: {
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    // Check for recent error logs (too many errors could indicate issues)
    const recentErrors = await prisma.pipelineErrorLog.count({
      where: {
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    // Check for stalled jobs (jobs in RUNNING state for too long)
    const stalledJobs = await prisma.prospectDiscoveryJob.count({
      where: {
        status: 'RUNNING',
        startedAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) }, // Running for > 30 min
      },
    });

    const errorRate = recentTransitions > 0 ? recentErrors / recentTransitions : 0;

    if (stalledJobs > 0) {
      return {
        status: 'degraded',
        message: `${stalledJobs} stalled jobs detected`,
        details: { recentTransitions, recentErrors, stalledJobs, errorRate },
      };
    }

    if (errorRate > 0.5) {
      return {
        status: 'degraded',
        message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
        details: { recentTransitions, recentErrors, errorRate },
      };
    }

    return {
      status: 'healthy',
      details: { recentTransitions, recentErrors, errorRate },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Cron check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check queue depth (prospects waiting in each stage)
 */
async function checkQueue(): Promise<HealthCheck> {
  try {
    const queueCounts = await prisma.prospectLead.groupBy({
      by: ['pipelineStatus'],
      _count: true,
      where: {
        pipelineStatus: { in: ['discovered', 'audited', 'QUALIFIED'] },
      },
    });

    const totalQueued = queueCounts.reduce((sum, q) => sum + q._count, 0);

    // Check DLQ depth
    const dlqCount = await prisma.deadLetterQueue.count({
      where: { status: 'pending' },
    });

    if (dlqCount > 100) {
      return {
        status: 'degraded',
        message: `High DLQ depth: ${dlqCount}`,
        details: { totalQueued, dlqCount, byStage: queueCounts },
      };
    }

    return {
      status: 'healthy',
      details: { totalQueued, dlqCount, byStage: queueCounts },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Queue check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check external API connectivity
 */
async function checkExternalApis(): Promise<HealthCheck> {
  const checks: Record<string, boolean> = {};
  let allHealthy = true;

  // Check Resend (email service)
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
      });
      checks.resend = response.ok;
      if (!response.ok) allHealthy = false;
    } catch {
      checks.resend = false;
      allHealthy = false;
    }
  } else {
    checks.resend = true; // Not configured, skip check
  }

  // Check Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const response = await fetch('https://api.stripe.com/v1/products', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        },
      });
      checks.stripe = response.ok;
      if (!response.ok) allHealthy = false;
    } catch {
      checks.stripe = false;
      allHealthy = false;
    }
  } else {
    checks.stripe = true; // Not configured, skip check
  }

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    details: checks,
  };
}

/**
 * GET /api/health
 *
 * Main health check endpoint
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const timestamp = new Date().toISOString();

  // Run all health checks in parallel
  const [database, cron, queue, externalApis] = await Promise.all([
    checkDatabase(),
    checkCron(),
    checkQueue(),
    checkExternalApis(),
  ]);

  // Determine overall status
  const checkResults = [database, cron, queue, externalApis];
  let overallStatus: HealthResponse['status'] = 'healthy';

  if (checkResults.some((c) => c.status === 'unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (checkResults.some((c) => c.status === 'degraded')) {
    overallStatus = 'degraded';
  }

  // Get additional metrics
  const [dlqCount, openCircuits, queuedJobs] = await Promise.all([
    prisma.deadLetterQueue.count({ where: { status: 'pending' } }).catch(() => 0),
    prisma.circuitBreakerState.count({ where: { state: 'OPEN' } }).catch(() => 0),
    prisma.prospectLead
      .count({
        where: { pipelineStatus: { in: ['discovered', 'audited', 'QUALIFIED'] } },
      })
      .catch(() => 0),
  ]);

  const response: HealthResponse = {
    status: overallStatus,
    timestamp,
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    checks: {
      database,
      cron,
      queue,
      externalApis,
    },
    metrics: {
      dlqCount,
      openCircuits,
      queuedJobs,
    },
  };

  // Log unhealthy status
  if (overallStatus === 'unhealthy') {
    logger.error(
      {
        event: 'health.unhealthy',
        checks: response.checks,
      },
      'Health check: UNHEALTHY'
    );
  } else if (overallStatus === 'degraded') {
    logger.warn(
      {
        event: 'health.degraded',
        checks: response.checks,
      },
      'Health check: DEGRADED'
    );
  }

  const httpStatus = overallStatus === 'unhealthy' ? 503 : overallStatus === 'degraded' ? 503 : 200;

  return NextResponse.json(response, { status: httpStatus });
}

/**
 * GET /api/health/live
 *
 * Liveness probe - just checks if the server is responding
 */
export async function GET_LIVE(): Promise<NextResponse<{ status: string; timestamp: string }>> {
  return NextResponse.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/health/ready
 *
 * Readiness probe - checks if the service is ready to accept traffic
 */
export async function GET_READY(): Promise<NextResponse<{ status: string; ready: boolean }>> {
  const database = await checkDatabase();

  const ready = database.status === 'healthy';

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      ready,
    },
    { status: ready ? 200 : 503 }
  );
}

/**
 * GET /healthz
 *
 * Standard Kubernetes-style liveness probe alias
 */
export async function GET_HEALTHZ(): Promise<NextResponse<{ status: string; timestamp: string }>> {
  return NextResponse.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /readyz
 *
 * Standard Kubernetes-style readiness probe alias
 */
export async function GET_READYZ(): Promise<NextResponse<{ status: string; ready: boolean }>> {
  const database = await checkDatabase();

  const ready = database.status === 'healthy';

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not_ready',
      ready,
    },
    { status: ready ? 200 : 503 }
  );
}
