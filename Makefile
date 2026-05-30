# ProposalOS Makefile
# Developer Experience: One-command setup and development

.PHONY: help setup dev stop test-audit clean reset lint typecheck test

# Default target
help:
	@echo "ProposalOS - Developer Commands"
	@echo "================================"
	@echo ""
	@echo "Setup & Development:"
	@echo "  make setup      - Full setup (install deps, env, DB, seed data)"
	@echo "  make dev        - Start development environment"
	@echo "  make stop       - Stop all Docker services"
	@echo ""
	@echo "Testing:"
	@echo "  make test       - Run test suite"
	@echo "  make test-audit - Run a sample audit to verify pipeline"
	@echo ""
	@echo "Maintenance:"
	@echo "  make lint       - Run ESLint"
	@echo "  make typecheck  - Run TypeScript type check"
	@echo "  make clean      - Remove node_modules and build artifacts"
	@echo "  make reset      - Full reset (clean + database volumes)"
	@echo ""

# Setup: Complete one-command setup for new developers
setup:
	@echo "🚀 Setting up ProposalOS..."
	@echo ""
	@echo "Step 1/7: Checking prerequisites..."
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed."; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
	@echo "✅ Prerequisites OK"
	@echo ""
	@echo "Step 2/7: Installing dependencies..."
	npm install
	@echo "✅ Dependencies installed"
	@echo ""
	@echo "Step 3/7: Setting up environment variables..."
	@if [ ! -f .env.local ]; then \
		cp .env.example .env.local; \
		echo "✅ Created .env.local from .env.example"; \
	else \
		echo "✅ .env.local already exists"; \
	fi
	@echo ""
	@echo "Step 4/7: Starting Docker services..."
	docker-compose up -d postgres redis
	@echo "⏳ Waiting for database to be ready..."
	@sleep 5
	@echo "✅ Docker services started"
	@echo ""
	@echo "Step 5/7: Running database migrations..."
	npx prisma migrate dev --name init
	@echo "✅ Database migrations complete"
	@echo ""
	@echo "Step 6/7: Seeding database with sample data..."
	npx prisma db seed
	@echo "✅ Database seeded"
	@echo ""
	@echo "Step 7/7: Validating environment..."
	npm run validate:env || echo "⚠️  Environment validation skipped (fill in .env.local manually)"
	@echo ""
	@echo "================================"
	@echo "✅ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit .env.local and fill in required API keys"
	@echo "  2. Run 'make dev' to start the development server"
	@echo "  3. Open http://localhost:3000"
	@echo ""
	@echo "Demo credentials (after seed):"
	@echo "  Email: demo@acme.com"
	@echo "  Password: password123"
	@echo "================================"

# Development: Start the development server
dev:
	@echo "🏗️  Starting ProposalOS development environment..."
	@echo ""
	@echo "Starting Docker services..."
	docker-compose up -d
	@echo ""
	@echo "Starting Next.js dev server..."
	@echo "Press Ctrl+C to stop"
	npm run dev

# Stop: Stop all Docker containers
stop:
	@echo "🛑 Stopping Docker services..."
	docker-compose down
	@echo "✅ Services stopped"

# Test: Run the test suite
test:
	@echo "🧪 Running tests..."
	npm test

# Test Audit: Run a sample audit to verify the pipeline works
test-audit:
	@echo "🧪 Running sample audit to verify pipeline..."
	@echo ""
	@echo "Creating audit for 'Joe's Pizza' in Chicago..."
	@curl -s -X POST http://localhost:3000/api/audit \
		-H "Content-Type: application/json" \
		-H "x-api-key: test-key" \
		-d '{"name": "Joes Pizza", "city": "Chicago"}' | jq '.' || \
	echo "Note: Install 'jq' for formatted JSON output"
	@echo ""
	@echo "✅ Sample audit request sent!"
	@echo "Check the response for the audit ID and status."

# Lint: Run ESLint
lint:
	@echo "🔍 Running ESLint..."
	npm run lint

# Typecheck: Run TypeScript type check
typecheck:
	@echo "🔍 Running TypeScript type check..."
	npx tsc --noEmit

# Clean: Remove build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf node_modules
	rm -rf .next
	rm -rf out
	@echo "✅ Clean complete"

# Reset: Full reset including database volumes
reset:
	@echo "⚠️  This will DELETE all data. Are you sure? (y/N)"
	@read ans && [ "$$ans" = "y" ] || exit 1
	@echo "🔄 Resetting environment..."
	docker-compose down -v
	rm -rf node_modules
	rm -rf .next
	rm -f .env.local
	@echo "✅ Reset complete. Run 'make setup' to start fresh."