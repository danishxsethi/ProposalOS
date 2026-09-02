#!/usr/bin/env bash
set -euo pipefail

TARGET_FILE="scripts/connect-db.sh"

if ! git diff --cached --name-only --diff-filter=ACMR | grep -Fxq "$TARGET_FILE"; then
  exit 0
fi

if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks git --help >/dev/null 2>&1; then
    gitleaks git --staged --redact --exit-code 1 . >/dev/null
  elif gitleaks protect --help >/dev/null 2>&1; then
    gitleaks protect --staged --redact >/dev/null
  fi
fi

staged_content="$(git show ":${TARGET_FILE}")"

if printf '%s\n' "$staged_content" | grep -Fq 'postgresql://'; then
  if printf '%s\n' "$staged_content" | grep -Fq '<password>'; then
    exit 0
  fi
  if printf '%s\n' "$staged_content" | grep -Fq '$DATABASE_URL'; then
    exit 0
  fi
  echo "[secret-scan] Refusing to commit ${TARGET_FILE}: raw database URL detected." >&2
  exit 1
fi
