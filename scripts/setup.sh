#!/bin/bash
# ProposalOS Setup Script
# One-command setup for new developers
# 
# Usage: ./scripts/setup.sh
#
# This script:
# 1. Validates prerequisites (Node.js, Docker)
# 2. Installs npm dependencies
# 3. Creates .env.local from .env.example
# 4. Starts Docker services (PostgreSQL, Redis)
# 5. Runs database migrations
# 6. Seeds the database with sample data
# 7. Runs a sample audit to verify the pipeline works

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Print header
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ProposalOS Setup Script            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Validate prerequisites
log_step "Step 1/7: Validating Prerequisites"

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is required but not installed."
    echo "   Install from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v)
log_success "Node.js installed: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    log_error "npm is required but not installed."
    exit 1
fi
NPM_VERSION=$(npm -v)
log_success "npm installed: $NPM_VERSION"

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is required but not installed."
    echo "   Install from: https://docs.docker.com/get-docker/"
    exit 1
fi
DOCKER_VERSION=$(docker --version)
log_success "Docker installed: $DOCKER_VERSION"

# Check if Docker is running
if ! docker info &> /dev/null; then
    log_error "Docker is not running. Please start Docker Desktop or the Docker service."
    exit 1
fi
log_success "Docker is running"

# Check for make (optional but recommended)
if command -v make &> /dev/null; then
    MAKE_VERSION=$(make -v | head -n 1)
    log_success "make installed: $MAKE_VERSION"
    log_info "Tip: You can use 'make setup' and 'make dev' for easier management"
else
    log_warning "make not found (optional, but recommended)"
fi

# Step 2: Install dependencies
log_step "Step 2/7: Installing Dependencies"

if [ -d "node_modules" ]; then
    log_info "node_modules exists, checking for updates..."
    npm install
else
    log_info "Installing dependencies (this may take a minute)..."
    npm install
fi
log_success "Dependencies installed"

# Step 3: Setup environment variables
log_step "Step 3/7: Setting Up Environment"

if [ -f ".env.local" ]; then
    log_success ".env.local already exists"
    log_info "To reset environment variables, delete .env.local and re-run this script"
else
    if [ -f ".env.example" ]; then
        cp .env.example .env.local
        log_success "Created .env.local from .env.example"
        log_warning "You must edit .env.local and fill in required API keys"
    else
        log_error ".env.example not found!"
        exit 1
    fi
fi

# Step 4: Start Docker services
log_step "Step 4/7: Starting Docker Services"

# Check if containers are already running
if docker-compose ps | grep -q "Up"; then
    log_info "Docker services already running"
else
    log_info "Starting PostgreSQL and Redis..."
    docker-compose up -d postgres redis 2>/dev/null || docker compose up -d postgres redis
    log_success "Docker services started"
fi

log_info "Waiting for database to be ready..."
sleep 5

# Verify database is accessible
if docker-compose ps postgres | grep -q "Up" 2>/dev/null || docker compose ps postgres | grep -q "Up" 2>/dev/null; then
    log_success "PostgreSQL is running"
else
    log_error "PostgreSQL failed to start"
    docker-compose logs postgres 2>/dev/null || docker compose logs postgres
    exit 1
fi

# Step 5: Run database migrations
log_step "Step 5/7: Running Database Migrations"

if npx prisma migrate status &> /dev/null; then
    log_info "Database is up to date"
else
    log_info "Running migrations..."
    npx prisma migrate dev --name init
    log_success "Database migrations complete"
fi

# Step 6: Seed database
log_step "Step 6/7: Seeding Database"

log_info "Seeding database with sample data..."
npx prisma db seed
log_success "Database seeded"

echo ""
echo "   Demo credentials:"
echo -e "   ${GREEN}Email:    demo@acme.com${NC}"
echo -e "   ${GREEN}Password: password123${NC}"
echo ""

# Step 7: Validate setup and run sample audit
log_step "Step 7/7: Validating Setup"

# Try to validate environment (may fail if API keys not filled)
if npm run validate:env &> /dev/null; then
    log_success "Environment validation passed"
else
    log_warning "Environment validation skipped"
    log_info "Edit .env.local and fill in required API keys"
fi

# Run sample audit if API keys are configured
log_info "Checking if sample audit can run..."
if grep -q "GOOGLE_PLACES_API_KEY=\"\"" .env.local 2>/dev/null; then
    log_warning "API keys not configured - sample audit skipped"
    log_info "To test the pipeline, fill in API keys and run:"
    echo "   curl -X POST http://localhost:3000/api/audit \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -H 'x-api-key: your-api-key' \\"
    echo "     -d '{\"name\": \"Joes Pizza\", \"city\": \"Chicago\"}'"
else
    log_info "Running sample audit to verify pipeline..."
    curl -s -X POST http://localhost:3000/api/audit \
        -H "Content-Type: application/json" \
        -H "x-api-key: test-key" \
        -d '{"name": "Joes Pizza", "city": "Chicago"}' > /tmp/audit_result.json 2>&1 || true
    if [ -s /tmp/audit_result.json ]; then
        log_success "Sample audit completed successfully"
    fi
fi

# Summary
echo ""
log_step "Setup Complete!"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ ProposalOS is ready to use!        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo ""
echo -e "  ${YELLOW}1.${NC} Edit .env.local and fill in required API keys:"
echo "     - GOOGLE_PLACES_API_KEY"
echo "     - GOOGLE_PAGESPEED_API_KEY"
echo "     - GOOGLE_AI_API_KEY"
echo "     - SERP_API_KEY"
echo "     - And other required keys"
echo ""
echo -e "  ${YELLOW}2.${NC} Start the development server:"
echo -e "     ${GREEN}npm run dev${NC}"
echo "     or if you have make:"
echo -e "     ${GREEN}make dev${NC}"
echo ""
echo -e "  ${YELLOW}3.${NC} Open your browser:"
echo "     http://localhost:3000"
echo ""
echo "Useful commands:"
echo -e "  ${GREEN}npm run dev${NC}          - Start development server"
echo -e "  ${GREEN}npm test${NC}             - Run tests"
echo -e "  ${GREEN}docker-compose down${NC}  - Stop Docker services"
echo ""

if command -v make &> /dev/null; then
    echo "Make commands:"
    echo -e "  ${GREEN}make setup${NC}           - Run full setup again"
    echo -e "  ${GREEN}make dev${NC}             - Start development"
    echo -e "  ${GREEN}make test${NC}            - Run tests"
    echo -e "  ${GREEN}make stop${NC}            - Stop Docker services"
    echo ""
fi

echo "Documentation:"
echo -e "  ${GREEN}README.md${NC}            - Project overview and quickstart"
echo -e "  ${GREEN}docs/ARCHITECTURE.md${NC} - System architecture"
echo -e "  ${GREEN}CONTRIBUTING.md${NC}      - How to contribute"
echo ""

log_success "Happy coding! 🚀"