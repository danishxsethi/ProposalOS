import 'server-only';
import crypto from 'crypto';

export type ExperimentName = 'exec-summary' | 'narrative-tone' | 'clustering-strategy';

interface ExperimentConfig {
    control: string;
    variant: string;
    traffic: number; // 0.0 to 1.0 (proportion receiving variant)
    active: boolean;
}

const EXPERIMENTS: Record<ExperimentName, ExperimentConfig> = {
    'exec-summary': {
        control: 'exec-summary-v1.txt',
        variant: 'exec-summary-v2.txt',
        traffic: 0.5,
        active: true,
    },
    'narrative-tone': {
        control: 'narrative-v1.txt',
        variant: 'narrative-direct.txt',
        traffic: 0.5,
        active: true,
    },
    'clustering-strategy': {
        control: 'clustering-v1.txt',
        variant: 'clustering-v1.txt', // TODO: Create clustering-v2.txt variant for real A/B testing
        traffic: 0.0,
        active: false,
    },
};

export interface PromptVariant {
    name: ExperimentName;
    variant: 'control' | 'variant';
    template: string; // The raw text content of the prompt
}

/**
 * Deterministically get a prompt variant based on auditId
 */
export function getPromptVariant(experimentName: ExperimentName, auditId: string): PromptVariant {
    const config = EXPERIMENTS[experimentName];

    // Default to control if experiment not active or missing
    if (!config || !config.active) {
        return {
            name: experimentName,
            variant: 'control',
            template: loadPrompt(config ? config.control : `${experimentName}-v1.txt`),
        };
    }

    // Deterministic hash: SHA256(auditId + experimentName) -> integer
    const hash = crypto.createHash('sha256').update(auditId + experimentName).digest('hex');
    const segment = parseInt(hash.substring(0, 8), 16) / 0xffffffff;

    const isVariant = segment < config.traffic;
    const filename = isVariant ? config.variant : config.control;

    return {
        name: experimentName,
        variant: isVariant ? 'variant' : 'control',
        template: loadPrompt(filename),
    };
}

/**
 * Load prompt text from file
 */
function loadPrompt(filename: string): string {
    // Dynamic import to avoid build-time issues if this module is somehow included in client bundle
    // although 'server-only' should prevent that.
    /* eslint-disable @typescript-eslint/no-var-requires */
    const fs = require('fs');
    const path = require('path');

    const promptsDir = path.join(process.cwd(), 'prompts');
    const filePath = path.join(promptsDir, filename);
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
        console.error(`[PromptAB] Failed to load prompt file: ${filename}`, error);
        throw new Error(`Prompt file not found: ${filename}`);
    }
}

/**
 * Helper to replace variables in a template
 * {{variable}} -> value
 */
export function fillTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const val = variables[key.trim()];
        return val !== undefined ? String(val) : match;
    });
}
