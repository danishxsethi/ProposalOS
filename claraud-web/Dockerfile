FROM public.ecr.aws/docker/library/node:24-alpine AS base
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
WORKDIR /app
# Set up sibling directories for the monorepo structure
COPY claraud-web/package.json claraud-web/package-lock.json ./claraud-web/
WORKDIR /app/claraud-web
RUN npm ci --production=false

FROM base AS builder
WORKDIR /app
# Copy dependencies and source files keeping the exact sibling structure
COPY --from=deps /app/claraud-web/node_modules ./claraud-web/node_modules
COPY claraud-web/ ./claraud-web/
COPY packages/shared/ ./packages/shared/
COPY prisma/ ./prisma/

# The shared Prisma schema writes its generated client to /app/node_modules.
# Point that path at Claraud's installed dependencies so the standalone web
# image contains the client that its own @prisma/client package will load.
RUN ln -s ./claraud-web/node_modules ./node_modules
WORKDIR /app/claraud-web
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RUN npx prisma generate --schema=../prisma/schema.prisma
RUN rm /app/node_modules
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output which maintains the monorepo structure
COPY --from=builder --chown=nextjs:nodejs /app/claraud-web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/claraud-web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/claraud-web/.next/static ./claraud-web/.next/static
COPY --from=builder /app/claraud-web/public ./public
COPY --from=builder /app/claraud-web/public ./claraud-web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app
CMD ["node", "server.js"]
