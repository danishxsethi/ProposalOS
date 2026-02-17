#!/usr/bin/env npx tsx
/**
 * Target list builder/manager for the Saskatoon 50-audit blitz.
 *
 * Usage:
 *   npx tsx scripts/target-list.ts list              # List all targets
 *   npx tsx scripts/target-list.ts list --vertical dentist
 *   npx tsx scripts/target-list.ts add --name "Acme Dental" --url https://acmedental.ca --vertical dentist
 *   npx tsx scripts/target-list.ts update 1 --name "Acme Dental" --url https://acmedental.ca
 *   npx tsx scripts/target-list.ts reset 1            # Reset target to pending
 *   npx tsx scripts/target-list.ts stats             # Summary stats
 *   npx tsx scripts/target-list.ts validate           # Validate URLs and required fields
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const TARGETS_PATH = path.join(process.cwd(), 'data', 'saskatoon-targets.json');

export interface Target {
    id: number;
    businessName: string;
    url: string;
    vertical: string;
    gbpUrl: string;
    address: string;
    status: 'pending' | 'success' | 'error';
    auditId: string | null;
    qaScore: number | null;
    errorMessage?: string;
    notes: string;
}

export interface TargetList {
    targets: Target[];
}

const VALID_VERTICALS = [
    'dentist',
    'law-firm',
    'hvac',
    'restaurant',
    'real-estate',
    'gym',
    'veterinary',
    'salon',
    'contractor',
    'retail',
];

function loadTargets(): TargetList {
    const raw = fs.readFileSync(TARGETS_PATH, 'utf-8');
    return JSON.parse(raw) as TargetList;
}

function saveTargets(data: TargetList): void {
    fs.writeFileSync(TARGETS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function listCmd(args: string[]): void {
    const data = loadTargets();
    const vertical = args.find((a) => a.startsWith('--vertical='))?.split('=')[1];
    let targets = data.targets;
    if (vertical) {
        targets = targets.filter((t) => t.vertical === vertical);
    }
    console.log(`\nTargets (${targets.length}):\n`);
    for (const t of targets) {
        const statusIcon = t.status === 'success' ? '✅' : t.status === 'error' ? '❌' : '⏳';
        const qa = t.qaScore != null ? `QA: ${t.qaScore}` : '';
        console.log(
            `  ${statusIcon} [${t.id}] ${(t.businessName || '(empty)').padEnd(30)} | ${t.vertical.padEnd(12)} | ${t.status.padEnd(7)} | ${qa}`
        );
    }
}

function addCmd(args: string[]): void {
    const getArg = (key: string): string | undefined =>
        args.find((a) => a.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
    const name = getArg('name');
    const url = getArg('url');
    const vertical = getArg('vertical');
    const gbpUrl = getArg('gbpUrl') ?? '';
    const address = getArg('address') ?? '';

    if (!name || !url || !vertical) {
        console.error('Usage: add --name="..." --url="..." --vertical=... [--gbpUrl=...] [--address=...]');
        process.exit(1);
    }
    if (!VALID_VERTICALS.includes(vertical)) {
        console.error(`Invalid vertical. Must be one of: ${VALID_VERTICALS.join(', ')}`);
        process.exit(1);
    }

    const data = loadTargets();
    const nextId = Math.max(0, ...data.targets.map((t) => t.id)) + 1;
    const newTarget: Target = {
        id: nextId,
        businessName: name,
        url,
        vertical,
        gbpUrl,
        address,
        status: 'pending',
        auditId: null,
        qaScore: null,
        notes: '',
    };
    data.targets.push(newTarget);
    saveTargets(data);
    console.log(`Added target ${nextId}: ${name}`);
}

function updateCmd(args: string[]): void {
    const idStr = args[0];
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
        console.error('Usage: update <id> [--name=...] [--url=...] [--gbpUrl=...] [--address=...] [--notes=...]');
        process.exit(1);
    }
    const getArg = (key: string): string | undefined =>
        args.find((a) => a.startsWith(`--${key}=`))?.split('=').slice(1).join('=');

    const data = loadTargets();
    const idx = data.targets.findIndex((t) => t.id === id);
    if (idx < 0) {
        console.error(`Target ${id} not found`);
        process.exit(1);
    }
    const t = data.targets[idx];
    const name = getArg('name');
    const url = getArg('url');
    const gbpUrl = getArg('gbpUrl');
    const address = getArg('address');
    const notes = getArg('notes');
    if (name !== undefined) t.businessName = name;
    if (url !== undefined) t.url = url;
    if (gbpUrl !== undefined) t.gbpUrl = gbpUrl;
    if (address !== undefined) t.address = address;
    if (notes !== undefined) t.notes = notes;
    saveTargets(data);
    console.log(`Updated target ${id}`);
}

function resetCmd(args: string[]): void {
    const idStr = args[0];
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
        console.error('Usage: reset <id>');
        process.exit(1);
    }
    const data = loadTargets();
    const t = data.targets.find((x) => x.id === id);
    if (!t) {
        console.error(`Target ${id} not found`);
        process.exit(1);
    }
    t.status = 'pending';
    t.auditId = null;
    t.qaScore = null;
    t.errorMessage = undefined;
    saveTargets(data);
    console.log(`Reset target ${id} to pending`);
}

function statsCmd(): void {
    const data = loadTargets();
    const byVertical = new Map<string, { total: number; pending: number; success: number; error: number }>();
    for (const t of data.targets) {
        const v = byVertical.get(t.vertical) ?? { total: 0, pending: 0, success: 0, error: 0 };
        v.total++;
        if (t.status === 'pending') v.pending++;
        else if (t.status === 'success') v.success++;
        else v.error++;
        byVertical.set(t.vertical, v);
    }
    console.log('\nTarget list stats:\n');
    console.log('| Vertical     | Total | Pending | Success | Error |');
    console.log('|--------------|-------|--------|---------|-------|');
    for (const [v, s] of byVertical) {
        console.log(`| ${v.padEnd(12)} | ${String(s.total).padStart(5)} | ${String(s.pending).padStart(6)} | ${String(s.success).padStart(7)} | ${String(s.error).padStart(5)} |`);
    }
    const total = data.targets.length;
    const pending = data.targets.filter((t) => t.status === 'pending').length;
    const success = data.targets.filter((t) => t.status === 'success').length;
    const error = data.targets.filter((t) => t.status === 'error').length;
    console.log(`| ${'TOTAL'.padEnd(12)} | ${String(total).padStart(5)} | ${String(pending).padStart(6)} | ${String(success).padStart(7)} | ${String(error).padStart(5)} |`);
}

function validateCmd(): void {
    const data = loadTargets();
    const issues: string[] = [];
    for (const t of data.targets) {
        if (!t.url && t.status === 'pending') {
            issues.push(`[${t.id}] ${t.vertical}: missing URL`);
        } else if (t.url && !t.url.startsWith('http')) {
            issues.push(`[${t.id}] ${t.url}: invalid URL (must start with http)`);
        }
        if (!VALID_VERTICALS.includes(t.vertical)) {
            issues.push(`[${t.id}] invalid vertical: ${t.vertical}`);
        }
    }
    if (issues.length === 0) {
        console.log('All targets valid.');
    } else {
        console.log('Validation issues:\n');
        issues.forEach((i) => console.log('  ' + i));
    }
}

function main(): void {
    const cmd = process.argv[2];
    const args = process.argv.slice(3);

    if (!fs.existsSync(TARGETS_PATH)) {
        console.error(`Target file not found: ${TARGETS_PATH}`);
        process.exit(1);
    }

    switch (cmd) {
        case 'list':
            listCmd(args);
            break;
        case 'add':
            addCmd(args);
            break;
        case 'update':
            updateCmd(args);
            break;
        case 'reset':
            resetCmd(args);
            break;
        case 'stats':
            statsCmd();
            break;
        case 'validate':
            validateCmd();
            break;
        default:
            console.log(`
Target list manager for Saskatoon 50-audit blitz.

Usage:
  npx tsx scripts/target-list.ts list [--vertical=VERTICAL]
  npx tsx scripts/target-list.ts add --name="..." --url="..." --vertical=VERTICAL [--gbpUrl=...] [--address=...]
  npx tsx scripts/target-list.ts update <id> [--name=...] [--url=...] [--gbpUrl=...] [--address=...] [--notes=...]
  npx tsx scripts/target-list.ts reset <id>
  npx tsx scripts/target-list.ts stats
  npx tsx scripts/target-list.ts validate

Verticals: ${VALID_VERTICALS.join(', ')}
`);
    }
}

main();
