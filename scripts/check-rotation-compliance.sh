#!/usr/bin/env bash
# Check AWS Secrets Manager rotation metadata for ProposalOS production secrets.
# Secret values are never retrieved.

set -euo pipefail

THRESHOLD_WARNING_DAYS=75
THRESHOLD_CRITICAL_DAYS=90
AWS_REGION="${AWS_REGION:-us-east-2}"
SECRET_PREFIX="${SECRET_PREFIX:-proposalos/app/production/}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CRITICAL_SECRETS=(
  "ADMIN_SECRET"
  "API_KEY"
  "AUDIT_TRAIL_ENCRYPTION_KEY"
  "CRON_SECRET"
  "DATABASE_URL"
  "FIELD_ENCRYPTION_KEY_ID"
  "FIELD_ENCRYPTION_PRIMARY_KEY"
  "INTERNAL_OPS_KEY"
  "NEXTAUTH_SECRET"
  "REDIS_URL"
  "RESEND_API_KEY"
  "SERP_API_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "WORKER_SECRET"
)

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
  if ! command -v aws >/dev/null 2>&1; then
    log_error "AWS CLI is not installed."
    exit 2
  fi
  if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is required to parse Secrets Manager timestamps."
    exit 2
  fi
  if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    log_error "AWS credentials are unavailable or expired."
    exit 2
  fi
  log_info "Checking ProposalOS Secrets Manager metadata in $AWS_REGION"
}

iso_to_epoch() {
  node -e 'const value = Date.parse(process.argv[1]); if (!Number.isFinite(value)) process.exit(1); process.stdout.write(String(Math.floor(value / 1000)));' "$1"
}

check_secrets() {
  local warning_count=0 critical_count=0 compliant_count=0 missing_count=0

  echo
  echo "========================================"
  echo "  Secret Rotation Compliance Check"
  echo "========================================"
  echo ""
  echo "Thresholds: warning at ${THRESHOLD_WARNING_DAYS} days; critical at ${THRESHOLD_CRITICAL_DAYS} days"
  echo ""
  printf "%-34s %-12s %-15s %s\n" "SECRET" "AGE (DAYS)" "STATUS" "LAST CHANGED"
  printf "%-34s %-12s %-15s %s\n" "------" "----------" "------" "------------"

  local now_epoch
  now_epoch=$(date +%s)
  for secret_name in "${CRITICAL_SECRETS[@]}"; do
    local secret_id="${SECRET_PREFIX}${secret_name}"
    local last_changed
    last_changed=$(aws secretsmanager describe-secret --secret-id "$secret_id" --region "$AWS_REGION" --query 'LastChangedDate' --output text 2>/dev/null || true)

    if [[ -z "$last_changed" || "$last_changed" == "None" ]]; then
      printf "%-34s %-12s %-15s %s\n" "$secret_name" "N/A" "MISSING" "-"
      missing_count=$((missing_count + 1))
      continue
    fi

    local changed_epoch days_old last_changed_date status status_color
    changed_epoch=$(iso_to_epoch "$last_changed") || changed_epoch="$now_epoch"
    days_old=$(( (now_epoch - changed_epoch) / 86400 ))
    last_changed_date="${last_changed%%T*}"

    if (( days_old >= THRESHOLD_CRITICAL_DAYS )); then
      status="CRITICAL"; status_color="$RED"; critical_count=$((critical_count + 1))
    elif (( days_old >= THRESHOLD_WARNING_DAYS )); then
      status="WARNING"; status_color="$YELLOW"; warning_count=$((warning_count + 1))
    else
      status="COMPLIANT"; status_color="$GREEN"; compliant_count=$((compliant_count + 1))
    fi
    printf "%-34s %-12s ${status_color}%-15s${NC} %s\n" "$secret_name" "$days_old" "$status" "$last_changed_date"
  done

  echo
  log_info "Compliant: $compliant_count/${#CRITICAL_SECRETS[@]}"
  (( warning_count == 0 )) || log_warning "Warning: $warning_count/${#CRITICAL_SECRETS[@]} approaching rotation deadline"
  (( critical_count == 0 )) || log_error "Critical: $critical_count/${#CRITICAL_SECRETS[@]} past rotation deadline"
  (( missing_count == 0 )) || log_error "Missing: $missing_count/${#CRITICAL_SECRETS[@]} secrets not found"

  if (( critical_count > 0 || missing_count > 0 )); then
    log_error "RESULT: Rotation compliance FAILED"
    return 2
  elif (( warning_count > 0 )); then
    log_warning "RESULT: Rotation compliance WARNING"
    return 1
  fi
  log_success "RESULT: All secrets are compliant with the 90-day policy"
  return 0
}

show_help() {
  echo "Usage: $0 [--region=AWS_REGION] [--prefix=SECRET_PREFIX]"
  echo "Environment: AWS_REGION, SECRET_PREFIX, AWS_PROFILE"
  echo "Exit codes: 0 compliant, 1 approaching deadline, 2 critical/missing"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region=*) AWS_REGION="${1#*=}"; shift ;;
    --prefix=*) SECRET_PREFIX="${1#*=}"; shift ;;
    --help) show_help; exit 0 ;;
    *) log_error "Unknown option: $1"; show_help; exit 2 ;;
  esac
done

check_prerequisites
exit_code=0
check_secrets || exit_code=$?
exit "$exit_code"
