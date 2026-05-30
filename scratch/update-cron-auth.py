import os
import re

files_to_update = [
    "app/api/cron/auto-promote/route.ts",
    "app/api/cron/check-grace-periods/route.ts",
    "app/api/cron/discovery/route.ts",
    "app/api/cron/email-sequence/route.ts",
    "app/api/cron/follow-ups/route.ts",
    "app/api/cron/gdpr-cleanup/route.ts",
    "app/api/cron/intelligence-aggregation/route.ts",
    "app/api/cron/monitor-reputation/route.ts",
    "app/api/cron/nps-surveys/route.ts",
    "app/api/cron/partner-matching/route.ts",
    "app/api/cron/pipeline-audit/route.ts",
    "app/api/cron/pipeline-closing/route.ts",
    "app/api/cron/pipeline-delivery/route.ts",
    "app/api/cron/pipeline-outreach/route.ts",
    "app/api/cron/predictions-calibration/route.ts",
    "app/api/cron/prompt-promotion/route.ts",
    "app/api/cron/reconcile-billing/route.ts",
    "app/api/cron/retention/route.ts",
    "app/api/cron/retry-webhooks/route.ts",
    "app/api/cron/scheduled-audits/route.ts",
    "app/api/cron/signal-detection/route.ts",
    "app/api/tenants/[tenantId]/delete-data/route.ts"
]

base_dir = "/Users/danishsethi/VSCODE/ProposalOS"

for rel_path in files_to_update:
    abs_path = os.path.join(base_dir, rel_path)
    if not os.path.exists(abs_path):
        print(f"File not found: {rel_path}")
        continue
    
    with open(abs_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Replace verifyCronAuth(...) with await verifyCronAuth(...)
    # and handle request/req arguments
    updated_content = re.sub(
        r'const\s+authError\s*=\s*verifyCronAuth\((req|request)\);',
        r'const authError = await verifyCronAuth(\1);',
        content
    )
    
    if updated_content != content:
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        print(f"Updated: {rel_path}")
    else:
        print(f"No changes needed: {rel_path}")
