# Map Stores to Prisma Migration Plan

## Overview

This document outlines the plan to migrate from in-memory Map-based stores to persistent PostgreSQL storage via Prisma.

## Current State

### In-Memory Stores (`claraud-web/src/lib/stores.ts`)

```typescript
export const scanStore = new Map<
  string,
  {
    token: string;
    url: string;
    businessName?: string;
    callCount: number;
    createdAt: number;
  }
>();

export const leadStore = new Map<
  string,
  {
    email: string;
    businessUrl: string;
    scanToken: string;
    scores: Record<string, number>;
    capturedAt: Date;
  }
>();

export const autoPipelineTriggerStore = new Map<
  string,
  {
    triggeredAt: number;
  }
>();
```

### Problems

1. **No persistence** - Data lost on server restart
2. **No scalability** - Memory limits per instance
3. **No multi-instance support** - Each instance has separate stores
4. **No querying** - Limited to Map operations
5. **No backup/recovery** - Data cannot be recovered

## Target State

### Prisma Schema Addition

```prisma
// Add to prisma/schema.prisma

model Scan {
  id           String   @id @default(cuid())
  token        String   @unique
  url          String
  businessName String?
  callCount    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relations
  leads        Lead[]

  @@index([token])
  @@index([createdAt])
}

model Lead {
  id          String   @id @default(cuid())
  email       String
  businessUrl String
  scanToken   String
  scores      Json     // Store scores as JSON
  capturedAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  // Relations
  scan        Scan     @relation(fields: [scanToken], references: [token])

  @@index([email])
  @@index([scanToken])
  @@index([capturedAt])
}

model PipelineTrigger {
  id          String   @id @default(cuid())
  entityType  String   // 'scan', 'audit', 'proposal'
  entityId    String
  triggeredAt DateTime @default(now())
  processed   Boolean  @default(false)

  @@index([entityType, entityId])
  @@index([processed])
}
```

## Migration Steps

### Step 1: Create Prisma Models

```bash
cd claraud-web
npx prisma migrate dev --name add_scan_lead_pipeline_models
```

### Step 2: Create Repository Layer

Create `claraud-web/src/lib/repositories/scan-repository.ts`:

```typescript
import { prisma } from '@/lib/prisma';

export const scanRepository = {
  async create(data: { token: string; url: string; businessName?: string }) {
    return prisma.scan.create({
      data: {
        ...data,
        callCount: 0,
      },
    });
  },

  async findByToken(token: string) {
    return prisma.scan.findUnique({
      where: { token },
      include: { leads: true },
    });
  },

  async incrementCallCount(token: string) {
    return prisma.scan.update({
      where: { token },
      data: { callCount: { increment: 1 } },
    });
  },

  async delete(token: string) {
    return prisma.scan.delete({
      where: { token },
    });
  },

  // Cleanup old scans (older than 7 days)
  async cleanupOldScans(daysOld: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return prisma.scan.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        leads: { none: {} }, // Only delete scans without leads
      },
    });
  },
};
```

Create `claraud-web/src/lib/repositories/lead-repository.ts`:

```typescript
import { prisma } from '@/lib/prisma';

export const leadRepository = {
  async create(data: {
    email: string;
    businessUrl: string;
    scanToken: string;
    scores: Record<string, number>;
  }) {
    return prisma.lead.create({
      data: {
        ...data,
        scores: data.scores as any, // Prisma accepts JSON
      },
      include: { scan: true },
    });
  },

  async findByEmail(email: string) {
    return prisma.lead.findMany({
      where: { email },
      include: { scan: true },
    });
  },

  async findByScanToken(scanToken: string) {
    return prisma.lead.findMany({
      where: { scanToken },
    });
  },
};
```

Create `claraud-web/src/lib/repositories/pipeline-trigger-repository.ts`:

```typescript
import { prisma } from '@/lib/prisma';

export const pipelineTriggerRepository = {
  async createOrSkip(entityType: string, entityId: string) {
    // Use upsert to prevent duplicate triggers within 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    return prisma.pipelineTrigger.upsert({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
      update: {
        triggeredAt: new Date(),
        processed: false,
      },
      create: {
        entityType,
        entityId,
        triggeredAt: new Date(),
        processed: false,
      },
    });
  },

  async getUnprocessed() {
    return prisma.pipelineTrigger.findMany({
      where: { processed: false },
      orderBy: { triggeredAt: 'asc' },
    });
  },

  async markProcessed(id: string) {
    return prisma.pipelineTrigger.update({
      where: { id },
      data: { processed: true },
    });
  },

  async cleanupOldTriggers(hoursOld: number = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);

    return prisma.pipelineTrigger.deleteMany({
      where: {
        triggeredAt: { lt: cutoffDate },
        processed: true,
      },
    });
  },
};
```

### Step 3: Update API Routes

Update `claraud-web/src/app/api/scan/route.ts`:

```typescript
// Before
import { scanStore } from '@/lib/stores';

// After
import { scanRepository } from '@/lib/repositories/scan-repository';

// In the route handler
const scan = await scanRepository.create({ token, url, businessName });
```

Update `claraud-web/src/app/api/lead/route.ts`:

```typescript
// Before
import { leadStore } from '@/lib/stores';

// After
import { leadRepository } from '@/lib/repositories/lead-repository';

// In the route handler
const lead = await leadRepository.create({ email, businessUrl, scanToken, scores });
```

### Step 4: Update Scan Status Polling

Update `claraud-web/src/app/api/scan-status/[token]/route.ts`:

```typescript
// Before
import { autoPipelineTriggerStore } from '@/lib/stores';

// Check if already triggered
const existing = autoPipelineTriggerStore.get(token);
if (existing) return;

// After
import { pipelineTriggerRepository } from '@/lib/repositories/pipeline-trigger-repository';

// Check if already triggered within 5 minutes
const existing = await pipelineTriggerRepository.createOrSkip('scan', token);
if (existing && !existing.processed && existing.triggeredAt > fiveMinutesAgo) {
  return; // Skip duplicate
}
```

### Step 5: Add Cleanup Cron Job

Create `app/api/cron/cleanup-stores/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { scanRepository } from '@/lib/repositories/scan-repository';
import { pipelineTriggerRepository } from '@/lib/repositories/pipeline-trigger-repository';

export async function GET(request: Request) {
  // Verify cron authentication
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Cleanup old data
  const [scansDeleted, triggersDeleted] = await Promise.all([
    scanRepository.cleanupOldScans(7),
    pipelineTriggerRepository.cleanupOldTriggers(24),
  ]);

  return NextResponse.json({
    success: true,
    scansDeleted: scansDeleted.count,
    triggersDeleted: triggersDeleted.count,
  });
}
```

Add to `cron.yaml`:

```yaml
- url: /api/cron/cleanup-stores
  schedule: 0 3 * * * # Daily at 3 AM
  headers:
    Authorization: 'Bearer ${CRON_SECRET}'
```

### Step 6: Remove Old Stores

After verifying the migration works:

1. Remove `claraud-web/src/lib/stores.ts`
2. Update all imports to use repositories
3. Remove any remaining Map-based logic

## Testing Checklist

- [ ] Scan creation works
- [ ] Lead capture works
- [ ] Pipeline triggers work
- [ ] No duplicate triggers within 5 minutes
- [ ] Old scans are cleaned up after 7 days
- [ ] Old triggers are cleaned up after 24 hours
- [ ] API routes return correct data
- [ ] No memory leaks

## Rollback Plan

If issues occur:

1. Keep `stores.ts` as fallback
2. Add feature flag to switch between stores
3. Monitor error rates after deployment
4. Be prepared to revert migration

## Performance Considerations

1. **Add database indexes** - Already included in schema
2. **Use connection pooling** - Prisma handles this
3. **Cache frequently accessed data** - Consider Redis for hot data
4. **Batch operations** - Use Prisma's `createMany` and `deleteMany`

## Timeline

| Phase     | Tasks                | Duration   |
| --------- | -------------------- | ---------- |
| 1         | Create Prisma models | 1 day      |
| 2         | Create repositories  | 2 days     |
| 3         | Update API routes    | 2 days     |
| 4         | Testing              | 2 days     |
| 5         | Deploy & monitor     | 1 day      |
| **Total** |                      | **8 days** |
