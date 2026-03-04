# Claraud.com

Claraud is an AI-powered business audit platform that helps local service businesses improve their online presence, customer experience, and competitive positioning. We provide comprehensive 30-dimension audits across website performance, Google Business Profile, SEO, reviews, social media, and competitive intelligence.

## Tech Stack

| Layer      | Technology              |
| ---------- | ----------------------- |
| Framework  | Next.js 16 (App Router) |
| UI Library | React 19                |
| Styling    | Tailwind CSS 4          |
| Components | shadcn/ui + Radix UI    |
| Charts     | Recharts                |
| Animations | Framer Motion           |
| Email      | React Email + Resend    |
| Analytics  | PostHog                 |
| Payments   | Stripe                  |
| Database   | PostgreSQL (Cloud SQL)  |
| Deployment | Google Cloud Run        |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Docker (for containerized deployment)

### Local Development

```bash
# Clone the repository
git clone https://github.com/danishxsethi/ProposalOS.git
cd ProposalOS/claraud-web

# Install dependencies
npm install
# or
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Run the development server
npm run dev
# or
pnpm dev

# Open http://localhost:3000
```

### Environment Variables

| Variable                  | Description                                        | Required           |
| ------------------------- | -------------------------------------------------- | ------------------ |
| `NEXT_PUBLIC_APP_URL`     | Base URL for the app (e.g., http://localhost:3000) | Yes                |
| `NEXTAUTH_SECRET`         | Secret for NextAuth encryption                     | Yes                |
| `NEXTAUTH_URL`            | Auth callback URL                                  | Yes                |
| `PROPOSAL_ENGINE_API_URL` | Backend API URL                                    | Yes                |
| `PROPOSAL_ENGINE_API_KEY` | API authentication key                             | Yes                |
| `RESEND_API_KEY`          | Email sending API key                              | Yes                |
| `STRIPE_SECRET_KEY`       | Stripe payment processing                          | No                 |
| `POSTHOG_KEY`             | Analytics tracking                                 | No                 |
| `DATABASE_URL`            | PostgreSQL connection string                       | No (for local dev) |

## Deployment

### Quick Deploy to Cloud Run

```bash
# 1. Set up secrets (one-time)
./setup-secrets.sh

# 2. Deploy
./deploy.sh
```

### Manual Deploy

```bash
# Build Docker image
docker build --platform linux/amd64 -t gcr.io/proposal-487522/claraud-web:latest .

# Push to Artifact Registry
docker push gcr.io/proposal-487522/claraud-web:latest

# Deploy to Cloud Run
gcloud run deploy claraud-web \
  --image gcr.io/proposal-487522/claraud-web:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 3000
```

## Project Structure

```
claraud-web/
├── app/                    # Next.js App Router pages
│   ├── (public)/          # Public-facing pages
│   │   ├── scan/          # Audit scan flow
│   │   └── report/        # Audit report pages
│   └── api/               # API routes
│       ├── og/            # Dynamic OG images
│       └── report/        # Report data endpoints
├── components/            # Reusable UI components
│   └── report/            # Report-specific components
├── lib/                   # Business logic & utilities
│   ├── audit/             # Audit modules
│   ├── email/             # Email templates
│   └── types.ts           # TypeScript types
├── public/                # Static assets
└── docs/                  # Documentation
```

## Key Architecture Decisions

### 1. Server-Side Rendering for SEO

The report pages are server-rendered with dynamic metadata and OG images for optimal SEO and social sharing.

### 2. Mock Data for Development

The app works locally with mock data, allowing development without external API dependencies.

### 3. Standalone Output

The Next.js build uses `output: 'standalone'` for minimal Docker images and fast cold starts on Cloud Run.

### 4. Serverless-First

No Cloud SQL required for initial launch. Database integration can be added later when persistent storage is needed.

## Development

### Running Tests

```bash
npm test
# or
pnpm test
```

### Linting

```bash
npm run lint
# or
pnpm run lint
```

### Building for Production

```bash
npm run build
# or
pnpm run build
```

## DNS Setup

See [docs/dns-setup.md](../docs/dns-setup.md) for complete instructions on configuring claraud.com on Namecheap with GCP Cloud Run.

## Support

For issues or questions, please open an issue on GitHub.
