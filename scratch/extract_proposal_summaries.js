const fs = require('fs');
const path = require('path');

const filePath = '/Users/danishsethi/VSCODE/ProposalOS/docs/remediation/029-beta-day0-five-site-audit-evidence.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let out = '';
function log(msg) {
  out += msg + '\n';
}

log(`Run Name: ${data.runName}`);
log(`Environment: ${data.environment}`);
log(`Run At: ${data.runAt}`);
log(`Base URL: ${data.baseUrl}`);
log(`Number of results: ${data.results.length}`);

data.results.forEach((r, idx) => {
  log(`\n=========================================`);
  log(`RESULT #${idx + 1}: ${r.name}`);
  log(`=========================================`);
  log(`URL: ${r.url}`);
  log(`Category: ${r.category}`);
  log(`Audit ID: ${r.auditId}`);
  log(`Audit Status: ${r.status}`);
  log(`Latency: ${r.latencyMs} ms`);
  log(`Findings Count: ${r.findingsCount}`);
  log(`Proposal ID: ${r.proposalId}`);
  log(`Proposal Status: ${r.proposalStatus}`);
  log(`Auto QA Score: ${r.autoQaScore}`);
  log(`Client Score: ${r.clientScore}`);
  log(`Proposal URL: ${r.proposalUrl}`);
  log(`Modules Failed: ${JSON.stringify(r.modulesFailed || [])}`);
  log(`Top Findings: ${JSON.stringify(r.topFindings || [])}`);

  if (r.rawProposal) {
    log(`\n--- PROPOSAL EXECUTIVE SUMMARY ---`);
    log(r.rawProposal.executiveSummary);
    log(`\n--- PRICING ---`);
    log(JSON.stringify(r.rawProposal.pricing, null, 2));
    log(`\n--- NEXT STEPS ---`);
    log(JSON.stringify(r.rawProposal.nextSteps, null, 2));
    log(`\n--- PAIN CLUSTERS (${r.rawProposal.painClusters ? r.rawProposal.painClusters.length : 0}) ---`);
    if (r.rawProposal.painClusters) {
      r.rawProposal.painClusters.forEach((pc, pIdx) => {
        log(`  Pain Cluster #${pIdx + 1}: ${pc.title}`);
        log(`  Description: ${pc.description}`);
        log(`  Severity: ${pc.severity}`);
        log(`  Findings Count: ${pc.findings ? pc.findings.length : 0}`);
        if (pc.findings) {
          pc.findings.forEach((f, fIdx) => {
            log(`    - Finding #${fIdx + 1}: ${f.title}`);
            log(`      Description: ${f.description}`);
          });
        }
      });
    }
  } else {
    log(`\n(No Proposal Generated)`);
  }
});

fs.writeFileSync('/Users/danishsethi/VSCODE/ProposalOS/scratch/proposal_summaries.txt', out);
console.log('Summaries written to scratch/proposal_summaries.txt');

