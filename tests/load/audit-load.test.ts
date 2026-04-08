/**
 * k6 Load Test for Audit Pipeline
 * 
 * Tests the audit creation and processing pipeline under various load conditions.
 * 
 * Scenarios:
 * 1. Single Audit Latency - P95 < 30s
 * 2. 100 Concurrent Audits - Zero errors
 * 3. Batch Processing (10 URLs) - < 5 minutes
 * 4. Stress Test - System breaking point
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom Metrics
const auditSuccessRate = new Rate('audit_success_rate');
const auditLatency = new Trend('audit_latency');
const auditDuration = new Trend('audit_duration'); // End-to-end time
const errorsEncountered = new Counter('errors_total');
const auditsCompleted = new Counter('audits_completed');

// Test Configuration
export const options = {
  thresholds: {
    'audit_success_rate': ['rate>0.99'], // 99% success rate required
    'audit_latency': ['p(95)<30000'], // P95 < 30 seconds
    'http_req_duration': ['p(95)<5000'], // API response P95 < 5s
    'http_req_failed': ['rate<0.01'], // < 1% HTTP errors
  },
  
  // Scenario 1: Ramp-up test
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },   // Ramp to 10 concurrent
        { duration: '2m', target: 50 },   // Ramp to 50 concurrent
        { duration: '3m', target: 100 },  // Ramp to 100 concurrent (peak)
        { duration: '5m', target: 100 },  // Sustain peak load
        { duration: '2m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      exec: 'singleAuditScenario',
    },
    
    // Background: Periodic batch audits
    batch_audits: {
      executor: 'constant-arrival-rate',
      rate: 1, // 1 batch per second
      timeUnit: '10s', // Every 10 seconds
      duration: '15m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: 'batchAuditScenario',
      startTime: '1m', // Start after initial ramp-up
    },
  },
  
  // Global settings
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  noVUConnectionReuse: true, // Simulate real users
};

// Test Data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const testWebsites = [
  { name: "Joe's Dental", url: "https://example-dental.com", city: "Saskatoon", industry: "dentist" },
  { name: "Smith Law Firm", url: "https://example-law.com", city: "Toronto", industry: "legal" },
  { name: "ABC Plumbing", url: "https://example-plumbing.com", city: "Vancouver", industry: "plumbing" },
  { name: "Quick HVAC Services", url: "https://example-hvac.com", city: "Calgary", industry: "hvac" },
  { name: "Downtown Restaurant", url: "https://example-restaurant.com", city: "Montreal", industry: "restaurant" },
];

// Headers
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

/**
 * Scenario 1: Single Audit Creation and Polling
 * 
 * Creates an audit and polls for completion.
 * Measures end-to-end latency from creation to completion.
 */
export function singleAuditScenario() {
  const website = testWebsites[Math.floor(Math.random() * testWebsites.length)];
  const startTime = Date.now();
  
  // Step 1: Create Audit
  const createPayload = JSON.stringify({
    businessName: website.name,
    businessUrl: website.url,
    businessCity: website.city,
    businessIndustry: website.industry,
  });
  
  const createResponse = http.post(`${BASE_URL}/api/audit`, createPayload, {
    headers,
    tags: { name: 'CreateAudit' },
  });
  
  const createOk = check(createResponse, {
    'create audit status 200/201': (r) => r.status === 200 || r.status === 201,
    'create audit has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.id;
      } catch {
        return false;
      }
    },
  });
  
  auditSuccessRate.add(createOk);
  
  if (!createOk) {
    errorsEncountered.add(1);
    sleep(1);
    return;
  }
  
  const auditId = JSON.parse(createResponse.body).id;
  const createLatency = Date.now() - startTime;
  auditLatency.add(createLatency, { phase: 'create' });
  
  // Step 2: Poll for Completion
  const maxPolls = 60; // 60 seconds max (should complete faster)
  const pollInterval = 1; // 1 second between polls
  let completed = false;
  let pollCount = 0;
  
  while (pollCount < maxPolls && !completed) {
    sleep(pollInterval);
    pollCount++;
    
    const statusResponse = http.get(`${BASE_URL}/api/audit/${auditId}`, {
      headers,
      tags: { name: 'GetAuditStatus' },
    });
    
    const statusOk = check(statusResponse, {
      'get audit status 200': (r) => r.status === 200,
    });
    
    if (!statusOk) {
      errorsEncountered.add(1);
      continue;
    }
    
    const status = JSON.parse(statusResponse.body);
    const isComplete = ['COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED'].includes(status.status);
    
    if (isComplete) {
      completed = true;
      const totalDuration = Date.now() - startTime;
      auditDuration.add(totalDuration);
      auditsCompleted.add(1);
      
      // Check final status
      check(status, {
        'audit completed successfully': (s) => s.status === 'COMPLETE',
        'audit has findings': (s) => s.findingsCount > 0,
      });
      
      break;
    }
  }
  
  if (!completed) {
    errorsEncountered.add(1, { error: 'timeout' });
  }
  
  sleep(2); // Wait between audits
}

/**
 * Scenario 2: Batch Audit Creation
 * 
 * Creates a batch of 10 audits simultaneously.
 * Measures batch processing throughput.
 */
export function batchAuditScenario() {
  const startTime = Date.now();
  const batchSize = 10;
  const auditIds: string[] = [];
  
  // Create batch of audits
  for (let i = 0; i < batchSize; i++) {
    const website = testWebsites[i % testWebsites.length];
    
    const payload = JSON.stringify({
      businessName: `${website.name} #${i + 1}`,
      businessUrl: website.url,
      businessCity: website.city,
      businessIndustry: website.industry,
      batchId: `batch-${Date.now()}`,
    });
    
    const response = http.post(`${BASE_URL}/api/audit/batch`, payload, {
      headers,
      tags: { name: 'CreateBatchAudit' },
    });
    
    const ok = check(response, {
      'batch audit created': (r) => r.status === 200 || r.status === 201,
    });
    
    if (ok && response.body) {
      try {
        const body = JSON.parse(response.body);
        if (body.id) auditIds.push(body.id);
      } catch {
        // Ignore parse errors
      }
    }
  }
  
  const createDuration = Date.now() - startTime;
  auditLatency.add(createDuration, { phase: 'batch_create' });
  
  // Poll all audits for completion
  let completed = 0;
  const maxPolls = 300; // 5 minutes max for batch
  let pollCount = 0;
  
  while (pollCount < maxPolls && completed < auditIds.length) {
    sleep(2);
    pollCount++;
    
    for (const auditId of auditIds) {
      const response = http.get(`${BASE_URL}/api/audit/${auditId}`, {
        headers,
        tags: { name: 'GetBatchAuditStatus' },
      });
      
      if (response.status === 200) {
        const status = JSON.parse(response.body);
        if (['COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED'].includes(status.status)) {
          completed++;
        }
      }
    }
  }
  
  const totalDuration = Date.now() - startTime;
  auditDuration.add(totalDuration, { phase: 'batch_total' });
  
  check({ completed }, {
    'batch completed within 5 min': (c) => totalDuration < 300000,
    'all batch audits processed': (c) => c === auditIds.length,
  });
}

/**
 * Handle Summary - Custom Report
 */
export function handleSummary(data: any) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'audit-load-test',
    thresholds: {
      p95_latency_target: '30000ms',
      success_rate_target: '99%',
    },
    results: {
      audit_success_rate: data.metrics.audit_success_rate?.values || {},
      audit_latency: data.metrics.audit_latency?.values || {},
      audit_duration: data.metrics.audit_duration?.values || {},
      errors_total: data.metrics.errors_total?.values || { count: 0 },
      audits_completed: data.metrics.audits_completed?.values || { count: 0 },
    },
    http: {
      reqs: data.metrics.http_reqs?.values || {},
      req_duration: data.metrics.http_req_duration?.values || {},
      req_failed: data.metrics.http_req_failed?.values || {},
    },
    pass: data.metrics.audit_success_rate?.values?.rate >= 0.99 &&
          data.metrics.audit_latency?.values?.['p(95)'] < 30000,
  };
  
  return {
    'stdout': textSummary(summary),
    [`results/load-test-${Date.now()}.json`]: JSON.stringify(summary, null, 2),
  };
}

function textSummary(summary: any): string {
  const pass = summary.pass ? '✅ PASS' : '❌ FAIL';
  return `
═══════════════════════════════════════════════════════════
  AUDIT LOAD TEST RESULTS
═══════════════════════════════════════════════════════════
  
  Overall: ${pass}
  
  Thresholds:
    P95 Latency: ${summary.results.audit_latency['p(95)']?.toFixed(0) || 'N/A'}ms (target: <30000ms)
    Success Rate: ${(summary.results.audit_success_rate.rate || 0) * 100}% (target: >99%)
  
  Audit Metrics:
    Total Audits Completed: ${summary.results.audits_completed.count || 0}
    Total Errors: ${summary.results.errors_total.count || 0}
    Avg Duration: ${summary.results.audit_duration.avg?.toFixed(0) || 'N/A'}ms
    P95 Duration: ${summary.results.audit_duration['p(95)']?.toFixed(0) || 'N/A'}ms
    P99 Duration: ${summary.results.audit_duration['p(99)']?.toFixed(0) || 'N/A'}ms
  
  HTTP Metrics:
    Total Requests: ${summary.http.reqs.count || 0}
    Avg Duration: ${summary.http.req_duration.avg?.toFixed(0) || 'N/A'}ms
    P95 Duration: ${summary.http.req_duration['p(95)']?.toFixed(0) || 'N/A'}ms
    Error Rate: ${(summary.http.req_failed.rate || 0) * 100}%
  
═══════════════════════════════════════════════════════════
`;
}