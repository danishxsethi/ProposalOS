FROM node:20-alpine AS base
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

WORKDIR /app/claraud-web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate --schema=../prisma/schema.prisma
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output which maintains the monorepo structure
COPY --from=builder --chown=nextjs:nodejs /app/claraud-web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/claraud-web/.next/static ./claraud-web/.next/static
COPY --from=builder /app/claraud-web/public ./claraud-web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run the app from the nested claraud-web directory
WORKDIR /app/claraud-web
CMD ["node", "server.js"]
