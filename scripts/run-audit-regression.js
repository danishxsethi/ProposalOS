#!/usr/bin/env node
/**
 * Audit Regression Gate
 * 
 * Runs 5 sample audits across different industries post-deploy and verifies
 * output quality meets the minimum threshold (≥8/10).
 * 
 * This script is designed to be run as part of the CI/CD pipeline
 * to prevent deployments that would degrade audit quality.
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.AUDIT_REGRESSION_BASE_URL || process.env.SMOKE_TEST_BASE_URL || 'http://localhost:3000';
const MIN_QUALITY_SCORE = parseInt(process.env.MIN_QUALITY_SCORE || '8', 10);
const NUM_AUDITS = 5;

// Sample websites across different industries for regression testing
const TEST_WEBSITES = [
  {
    industry: 'Restaurant',
    url: 'https://www.example-restaurant.com',
    name: 'Sample Restaurant'
  },
  {
    industry: 'Dental/Medical',
    url: 'https://www.example-dental.com',
    name: 'Sample Dental Clinic'
  },
  {
    industry: 'Legal Services',
    url: 'https://www.example-law.com',
    name: 'Sample Law Firm'
  },
  {
    industry: 'Home Services',
    url: 'https://www.example-plumbing.com',
    name: 'Sample Plumbing Service'
  },
  {
    industry: 'Retail/E-commerce',
    url: 'https://www.example-retail.com',
    name: 'Sample Retail Store'
  }
];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Make HTTP request to the API
 */
function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000); // 60 second timeout

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Run a single audit and return the quality score
 */
async function runAudit(website, index) {
  log(`\n[${index + 1}/${NUM_AUDITS}] Running audit for ${website.name} (${website.industry})...`, colors.blue);
  log(`URL: ${website.url}`, colors.cyan);

  try {
    // Step 1: Create audit via API
    const auditResponse = await makeRequest(
      `${BASE_URL}/api/audit`,
      'POST',
      { url: website.url }
    );

    if (auditResponse.status !== 200 && auditResponse.status !== 201) {
      log(`  ❌ Failed to create audit: HTTP ${auditResponse.status}`, colors.red);
      return {
        industry: website.industry,
        success: false,
        score: 0,
        error: `Failed to create audit: HTTP ${auditResponse.status}`
      };
    }

    const auditId = auditResponse.data.id || auditResponse.data.auditId;
    log(`  ✓ Audit created with ID: ${auditId}`, colors.green);

    // Step 2: Poll for completion (with timeout)
    let status = 'pending';
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max (30 * 10s)
    let result = null;

    while (status === 'pending' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      attempts++;

      const statusResponse = await makeRequest(`${BASE_URL}/api/audit/${auditId}`);
      
      if (statusResponse.status === 200) {
        status = statusResponse.data.status || statusResponse.data.auditStatus;
        result = statusResponse.data;
      } else {
        log(`  ⚠ Status check failed: HTTP ${statusResponse.status}`, colors.yellow);
      }

      log(`  ⏳ Attempt ${attempts}/${maxAttempts} - Status: ${status}`, colors.yellow);
    }

    if (status !== 'completed') {
      log(`  ❌ Audit did not complete after ${maxAttempts} attempts`, colors.red);
      return {
        industry: website.industry,
        success: false,
        score: 0,
        error: 'Audit timeout'
      };
    }

    // Step 3: Evaluate quality score
    const qualityScore = evaluateQualityScore(result);
    log(`  ✓ Quality Score: ${qualityScore}/10`, colors.green);

    return {
      industry: website.industry,
      success: true,
      score: qualityScore,
      result
    };

  } catch (error) {
    log(`  ❌ Error: ${error.message}`, colors.red);
    return {
      industry: website.industry,
      success: false,
      score: 0,
      error: error.message
    };
  }
}

/**
 * Evaluate the quality of an audit result
 * Returns a score from 0-10
 */
function evaluateQualityScore(auditResult) {
  let score = 10;
  const deductions = [];

  // Check for critical findings
  if (!auditResult.findings || auditResult.findings.length === 0) {
    score -= 3;
    deductions.push('No findings generated');
  }

  // Check for accessibility findings
  const accessibilityFindings = auditResult.findings?.filter(f => f.category === 'accessibility') || [];
  if (accessibilityFindings.length < 2) {
    score -= 2;
    deductions.push('Insufficient accessibility findings');
  }

  // Check for SEO findings
  const seoFindings = auditResult.findings?.filter(f => f.category === 'seo') || [];
  if (seoFindings.length < 2) {
    score -= 2;
    deductions.push('Insufficient SEO findings');
  }

  // Check for performance findings
  const performanceFindings = auditResult.findings?.filter(f => f.category === 'performance') || [];
  if (performanceFindings.length < 1) {
    score -= 1;
    deductions.push('Insufficient performance findings');
  }

  // Check for actionable recommendations
  const findingsWithRecommendations = auditResult.findings?.filter(f => f.recommendation && f.recommendation.length > 50) || [];
  if (findingsWithRecommendations.length < auditResult.findings?.length * 0.8) {
    score -= 1;
    deductions.push('Insufficient actionable recommendations');
  }

  // Check for evidence/proof
  const findingsWithEvidence = auditResult.findings?.filter(f => f.evidence || f.screenshot) || [];
  if (findingsWithEvidence.length < auditResult.findings?.length * 0.5) {
    score -= 1;
    deductions.push('Insufficient evidence provided');
  }

  // Log deductions
  if (deductions.length > 0) {
    deductions.forEach(d => console.log(`    - ${d}`));
  }

  return Math.max(0, score);
}

/**
 * Main function
 */
async function main() {
  log('='.repeat(60), colors.magenta);
  log('AUDIT REGRESSION GATE', colors.magenta);
  log('='.repeat(60), colors.magenta);
  log(`Base URL: ${BASE_URL}`, colors.cyan);
  log(`Minimum Quality Score: ${MIN_QUALITY_SCORE}/10`, colors.cyan);
  log(`Number of Audits: ${NUM_AUDITS}`, colors.cyan);
  log('='.repeat(60), colors.magenta);

  // Check if the service is available
  try {
    const healthResponse = await makeRequest(`${BASE_URL}/api/health`);
    if (healthResponse.status !== 200) {
      log(`\n❌ Service health check failed: HTTP ${healthResponse.status}`, colors.red);
      process.exit(1);
    }
    log('\n✓ Service health check passed', colors.green);
  } catch (error) {
    log(`\n❌ Service health check failed: ${error.message}`, colors.red);
    process.exit(1);
  }

  // Run audits
  const results = [];
  for (let i = 0; i < NUM_AUDITS; i++) {
    const result = await runAudit(TEST_WEBSITES[i], i);
    results.push(result);
  }

  // Summary
  log('\n' + '='.repeat(60), colors.magenta);
  log('AUDIT REGRESSION SUMMARY', colors.magenta);
  log('='.repeat(60), colors.magenta);

  const successfulAudits = results.filter(r => r.success);
  const failedAudits = results.filter(r => !r.success);
  const averageScore = successfulAudits.length > 0
    ? successfulAudits.reduce((sum, r) => sum + r.score, 0) / successfulAudits.length
    : 0;

  log(`\nTotal Audits: ${NUM_AUDITS}`, colors.cyan);
  log(`Successful: ${successfulAudits.length}`, colors.green);
  log(`Failed: ${failedAudits.length}`, failedAudits.length > 0 ? colors.red : colors.green);
  log(`Average Quality Score: ${averageScore.toFixed(2)}/10`, colors.cyan);

  // Industry breakdown
  log('\nBy Industry:', colors.cyan);
  results.forEach(r => {
    const icon = r.success ? '✓' : '❌';
    const scoreText = r.success ? `${r.score}/10` : `FAILED: ${r.error}`;
    const color = r.success && r.score >= MIN_QUALITY_SCORE ? colors.green : 
                  r.success ? colors.yellow : colors.red;
    log(`  ${icon} ${r.industry}: ${scoreText}`, color);
  });

  // Final verdict
  log('\n' + '='.repeat(60), colors.magenta);
  
  const allSuccessful = failedAudits.length === 0;
  const scorePasses = averageScore >= MIN_QUALITY_SCORE;
  const passed = allSuccessful && scorePasses;

  if (passed) {
    log('✅ AUDIT REGRESSION GATE: PASSED', colors.green);
    log(`   All ${NUM_AUDITS} audits completed successfully`, colors.green);
    log(`   Average quality score (${averageScore.toFixed(2)}) meets threshold (${MIN_QUALITY_SCORE})`, colors.green);
    process.exit(0);
  } else {
    log('❌ AUDIT REGRESSION GATE: FAILED', colors.red);
    if (!allSuccessful) {
      log(`   ${failedAudits.length} audit(s) failed to complete`, colors.red);
    }
    if (!scorePasses) {
      log(`   Average quality score (${averageScore.toFixed(2)}) below threshold (${MIN_QUALITY_SCORE})`, colors.red);
    }
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});