# Security Incident: Committed Cloud SQL Credential

## Status

- Incident ID: `P0-04`
- Severity: `P0`
- Current state: active until the Cloud SQL password is rotated and git history is purged

## What happened

- A production Cloud SQL credential was committed to `scripts/connect-db.sh`.
- The plaintext credential has been removed from the working tree in this remediation.
- Git history has **not** been rewritten yet.

## Immediate actions

1. Rotate the Cloud SQL password in GCP Console.
2. Update the rotated value in Secret Manager and any dependent runtime config.
3. Invalidate any local copies of the leaked credential.

## History purge

Do **not** run history rewrite until the team is ready to force-push every affected branch.

Safe local workflow:

```bash
printf '%s==>REDACTED\n' "$LEAKED_CLOUD_SQL_PASSWORD" > /tmp/filter-repo-replacements.txt
git filter-repo --replace-text /tmp/filter-repo-replacements.txt
rm /tmp/filter-repo-replacements.txt
```

Set `LEAKED_CLOUD_SQL_PASSWORD` locally to the leaked password from your incident tracker or secure notes. Do not commit that value again.

## Verification

- `git grep -n 'postgresql://postgres:' -- scripts/connect-db.sh` returns no matches.
- `scripts/pre-commit-secret-scan.sh` blocks commits that reintroduce a raw DSN into `scripts/connect-db.sh`.
