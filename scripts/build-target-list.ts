#!/usr/bin/env npx tsx
/**
 * Build a target list of 50 Saskatoon businesses for validation blitz.
 * Uses Google Places API (Text Search) with caching and rate limiting.
 *
 * Usage:
 *   npm run build-targets           # Build list only
 *   npm run build-targets -- --import  # Build and import to database
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import * as fs from 'fs-extra';
import * as crypto from 'crypto';

const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const RATE_LIMIT_MS = 200;
const CACHE_DIR = path.join(process.cwd(), 'scripts', 'output', 'cache');
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'output');
const CACHE_TTL_HOURS = 24 * 7; // 7 days

const VERTICALS: { key: string; queries: string[] }[] = [
  { key: 'dentist', queries: ['dentist Saskatoon', 'dental clinic Saskatoon'] },
  { key: 'law-firm', queries: ['law firm Saskatoon', 'lawyer Saskatoon'] },
  { key: 'hvac', queries: ['HVAC Saskatoon', 'heating cooling Saskatoon'] },
  { key: 'restaurant', queries: ['restaurant Saskatoon', 'local restaurant Saskatoon'] },
  { key: 'real-estate', queries: ['real estate agent Saskatoon', 'realtor Saskatoon'] },
  { key: 'gym', queries: ['gym Saskatoon', 'fitness center Saskatoon'] },
  { key: 'veterinarian', queries: ['veterinarian Saskatoon', 'vet clinic Saskatoon'] },
  { key: 'hair-salon', queries: ['hair salon Saskatoon', 'hair stylist Saskatoon'] },
  { key: 'home-contractor', queries: ['home contractor Saskatoon', 'general contractor Saskatoon'] },
  { key: 'retail', queries: ['retail store Saskatoon', 'local store Saskatoon'] },
];

// Known chains/franchises to exclude (case-insensitive partial match)
const CHAIN_BLOCKLIST = [
  "mcdonald's", "mcdonalds", "walmart", "tim hortons", "tim Horton's",
  "subway", "starbucks", "dollarama", "canadian tire", "home depot",
  "lowes", "costco", "best buy", "winners", "marshalls", "pet smart",
  "petco", "petsmart", "dental corp", "123 dentist", "dental choice",
  "dental associates", "law depot", "legal shield", "h&r block",
  "minuteman press", "staples", "ups store", "fedex", "dominos",
  "pizza hut", "kfc", "burger king", "wendy's", "wendys", "a&w",
  "harvey's", "swiss chalet", "east side mario", "montana's",
  "the keg", "milestones", "earls", "cactus club", "boston pizza",
  "sport chek", "marks", "reitmans", "la senza", "roots",
  "lululemon", "gap", "old navy", "h&m", "zara", "indigo",
  "chapters", "coles", "shoppers drug mart", "rexall", "london drugs",
];

interface PlaceResult {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
}

interface TargetBusiness {
  businessName: string;
  placeId: string;
  website: string;
  phone: string;
  address: string;
  rating: number;
  reviewCount: number;
  category: string;
  vertical: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getCacheKey(query: string): string {
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  return `places_target_${hash}`;
}

async function getCached<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  await fs.ensureDir(CACHE_DIR);
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  const ttlMs = CACHE_TTL_HOURS * 60 * 60 * 1000;

  if (await fs.pathExists(filePath)) {
    const entry = await fs.readJson(filePath);
    if (Date.now() < entry.expiresAt) {
      return entry.data as T;
    }
    await fs.remove(filePath);
  }

  const data = await fetchFn();
  await fs.writeJson(filePath, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
  return data;
}

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_BLOCKLIST.some((chain) => lower.includes(chain));
}

function extractPlaceId(place: PlaceResult): string {
  const id = place.id ?? place.name;
  if (typeof id === 'string' && id.startsWith('places/')) {
    return id.replace(/^places\//, '');
  }
  return id ?? '';
}

function extractDisplayName(place: PlaceResult): string {
  const dn = place.displayName?.text;
  if (dn) return dn;
  if (typeof place.name === 'string') return place.name;
  return 'Unknown';
}

async function searchPlaces(query: string, maxResults: number = 10): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is required. Add it to .env');
  }

  const cacheKey = getCacheKey(`${query}:${maxResults}`);
  return getCached(cacheKey, async () => {
    const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.name,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.types,places.primaryTypeDisplayName',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: maxResults,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    return json.places ?? [];
  });
}

function placeToTarget(place: PlaceResult, vertical: string): TargetBusiness | null {
  const website = place.websiteUri?.trim();
  if (!website) return null;

  const name = extractDisplayName(place);
  if (isChain(name)) return null;

  const reviewCount = place.userRatingCount ?? 0;
  if (reviewCount < 5) return null;

  const placeId = extractPlaceId(place);
  const phone =
    place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? '';
  const category =
    place.primaryTypeDisplayName?.text ?? place.types?.[0] ?? '';

  return {
    businessName: name,
    placeId,
    website,
    phone,
    address: place.formattedAddress ?? '',
    rating: place.rating ?? 0,
    reviewCount,
    category,
    vertical,
  };
}

async function fetchVertical(
  verticalKey: string,
  queries: string[],
  targetCount: number
): Promise<TargetBusiness[]> {
  const seen = new Set<string>();
  const results: TargetBusiness[] = [];

  for (const query of queries) {
    if (results.length >= targetCount) break;

    const places = await searchPlaces(query, 10);
    await sleep(RATE_LIMIT_MS);

    for (const place of places) {
      if (results.length >= targetCount) break;
      const target = placeToTarget(place, verticalKey);
      if (target && !seen.has(target.placeId)) {
        seen.add(target.placeId);
        results.push(target);
      }
    }
  }

  return results;
}

async function buildTargetList(): Promise<TargetBusiness[]> {
  const all: TargetBusiness[] = [];
  const seenPlaceIds = new Set<string>();

  for (const { key, queries } of VERTICALS) {
    const verticalResults = await fetchVertical(key, queries, 5);
    for (const t of verticalResults) {
      if (!seenPlaceIds.has(t.placeId)) {
        seenPlaceIds.add(t.placeId);
        all.push(t);
      }
    }
  }

  return all;
}

function printSummary(targets: TargetBusiness[]): void {
  const byVertical = new Map<string, TargetBusiness[]>();
  for (const t of targets) {
    const arr = byVertical.get(t.vertical) ?? [];
    arr.push(t);
    byVertical.set(t.vertical, arr);
  }

  console.log('\n| Vertical        | Count | Avg Rating | Avg Reviews | All Have Websites |');
  console.log('|-----------------|-------|------------|-------------|-------------------|');

  for (const [vertical, arr] of byVertical) {
    const count = arr.length;
    const avgRating =
      count > 0
        ? (arr.reduce((s, x) => s + x.rating, 0) / count).toFixed(1)
        : '0';
    const avgReviews =
      count > 0
        ? Math.round(
            arr.reduce((s, x) => s + x.reviewCount, 0) / count
          ).toString()
        : '0';
    const allWebsites = arr.every((x) => !!x.website) ? 'Yes' : 'No';
    console.log(
      `| ${vertical.padEnd(15)} | ${String(count).padStart(5)} | ${String(avgRating).padStart(10)} | ${String(avgReviews).padStart(11)} | ${allWebsites.padEnd(17)} |`
    );
  }

  console.log(
    `\nTotal: ${targets.length} businesses across ${byVertical.size} verticals\n`
  );
}

async function writeOutputs(targets: TargetBusiness[]): Promise<void> {
  await fs.ensureDir(OUTPUT_DIR);

  const jsonPath = path.join(OUTPUT_DIR, 'saskatoon-targets.json');
  await fs.writeJson(jsonPath, targets, { spaces: 2 });
  console.log(`Wrote ${jsonPath}`);

  const csvPath = path.join(OUTPUT_DIR, 'saskatoon-targets.csv');
  const headers = [
    'businessName',
    'placeId',
    'website',
    'phone',
    'address',
    'rating',
    'reviewCount',
    'category',
    'vertical',
  ];
  const rows = targets.map((t) =>
    headers.map((h) => {
      const v = (t as unknown as Record<string, unknown>)[h];
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  await fs.writeFile(csvPath, [headers.join(','), ...rows].join('\n'));
  console.log(`Wrote ${csvPath}`);
}

async function importToDb(targets: TargetBusiness[]): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const source = 'saskatoon-validation';
  let created = 0;
  let skipped = 0;

  for (const t of targets) {
    const existing =
      t.placeId &&
      (await prisma.auditTarget.findFirst({
        where: { placeId: t.placeId, source },
      }));

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.auditTarget.create({
      data: {
        businessName: t.businessName,
        businessCity: 'Saskatoon',
        businessUrl: t.website,
        placeId: t.placeId || null,
        phone: t.phone || null,
        address: t.address || null,
        rating: t.rating || null,
        reviewCount: t.reviewCount || null,
        category: t.category || null,
        vertical: t.vertical,
        source,
      },
    });
    created++;
  }

  await prisma.$disconnect();
  console.log(
    `\nImport complete: ${created} created, ${skipped} skipped (already exist)`
  );
}

async function main(): Promise<void> {
  const doImport = process.argv.includes('--import');

  console.log('Building Saskatoon target list...');
  const targets = await buildTargetList();

  if (targets.length === 0) {
    console.error('No qualifying businesses found. Check API key and filters.');
    process.exit(1);
  }

  await writeOutputs(targets);
  printSummary(targets);

  if (doImport) {
    console.log('Importing to database...');
    await importToDb(targets);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
