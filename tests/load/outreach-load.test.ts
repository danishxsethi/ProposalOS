/**
 * k6 Load Test for Cold Outreach Pipeline
 * 
 * Tests the email outreach system under sustained load.
 * 
 * Target: 1000 emails/hour sustained throughput
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom Metrics
const emailSuccessRate = new Rate('email_success_rate');
const emailLatency = new Trend('email_latency');
const emailsSent = new Counter('emails_sent_total');
const emailsDelivered = new Counter('emails_delivered_total');
const bounces = new Counter('bounces_total');
const errorsTotal = new Counter('errors_total');

// Test Configuration
export const options = {
  thresholds: {
    'email_success_rate': ['rate>0.98'], // 98% success rate
    'http_req_failed': ['rate<0.02'], // < 2% HTTP errors
    'emails_sent_total': ['count>=1000'], // At least 1000 emails in test duration
  },
  
  scenarios: {
    // Sustained throughput test
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 17, // ~1000 per hour = 16.67 per minute
      timeUnit: '1m', // Per minute
      duration: '60m', // Run for 1 hour
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'sustainedOutreachScenario',
    },
    
    // Burst test
    burst_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '2m', target: 20 },
        { duration: '5m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      exec: 'burstOutreachScenario',
      startTime: '30m', // Start burst at 30 minute mark
    },
  },
  
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// Test Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

/**
 * Scenario 1: Sustained Outreach
 * 
 * Sends emails at a steady rate to simulate 1000/hour throughput.
 */
export function sustainedOutreachScenario() {
  const startTime = Date.now();
  
  // Trigger outreach job
  const response = http.post(
    `${BASE_URL}/api/cron/pipeline-outreach`,
    null,
    {
      headers: {
        ...headers,
        'X-Cron-Secret': __ENV.CRON_SECRET || 'test-cron-secret',
      },
      tags: { name: 'TriggerOutreach' },
    }
  );
  
  const ok = check(response, {
    'outreach triggered': (r) => r.status === 200 || r.status === 202,
  });
  
  emailSuccessRate.add(ok);
  
  if (ok) {
    const latency = Date.now() - startTime;
    emailLatency.add(latency);
    emailsSent.add(1);
  } else {
    errorsTotal.add(1);
  }
  
  sleep(3.5); // ~17 per minute
}

/**
 * Scenario 2: Burst Outreach
 * 
 * Simulates a burst of outreach activity.
 */
export function burstOutreachScenario() {
  // Get outreach queue status
  const statusResponse = http.get(`${BASE_URL}/api/outreach/jobs`, {
    headers,
    tags: { name: 'GetOutreachStatus' },
  });
  
  check(statusResponse, {
    'status check ok': (r) => r.status === 200,
  });
  
  sleep(1);
}

/**
 * Summary Report
 */
export function handleSummary(data: any) {
  const totalSent = data.metrics.emails_sent_total?.values?.count || 0;
  const throughput = totalSent; // For 1-hour test, count = per hour
  
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'outreach-load-test',
    thresholds: {
      throughput_target: '1000 emails/hour',
      success_rate_target: '98%',
    },
    results: {
      emails_sent: totalSent,
      throughput_per_hour: throughput,
      success_rate: data.metrics.email_success_rate?.values?.rate || 0,
      errors: data.metrics.errors_total?.values?.count || 0,
      bounces: data.metrics.bounces?.values?.count || 0,
    },
    pass: throughput >= 1000 && (data.metrics.email_success_rate?.values?.rate || 0) >= 0.98,
  };
  
  return {
    'stdout': `
═══════════════════════════════════════════════════════════
  OUTREACH LOAD TEST RESULTS
═══════════════════════════════════════════════════════════

  Overall: ${summary.pass ? '✅ PASS' : '❌ FAIL'}
  
  Throughput: ${summary.results.throughput_per_hour} emails/hour (target: 1000)
  Success Rate: ${(summary.results.success_rate * 100).toFixed(2)}% (target: 98%)
  Total Sent: ${summary.results.emails_sent}
  Errors: ${summary.results.errors}
  Bounces: ${summary.results.bounces}

═══════════════════════════════════════════════════════════
`,
    [`results/outreach-test-${Date.now()}.json`]: JSON.stringify(summary, null, 2),
  };
}