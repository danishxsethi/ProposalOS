/**
 * Pipeline Configuration Admin UI
 * 
 * Displays current configuration, allows editing all configuration fields,
 * and shows spending limits and usage.
 * 
 * Requirements: 9.2, 9.5
 */

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface PipelineConfig {
  id: string;
  tenantId: string;
  concurrencyLimit: number;
  batchSize: number;
  painScoreThreshold: number;
  dailyVolumeLimit: number;
  spendingLimitCents: number;
  hotLeadPercentile: number;
  emailMinQualityScore: number;
  maxEmailsPerDomainPerDay: number;
  followUpSchedule: number[];
  pausedStages: string[];
  country: string;
  language: string;
  currency: string;
  pricingMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export default function PipelineConfigPage() {
  const { data: session } = useSession();
  const [config, setConfig] = useState<PipelineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pipeline/config');
      
      if (!response.ok) {
        throw new Error('Failed to fetch configuration');
      }

      const data = await response.json();
      setConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const response = await fetch('/api/pipeline/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save configuration');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (field: keyof PipelineConfig, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load pipeline configuration</p>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  const spendingLimitDollars = config.spendingLimitCents / 100;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Pipeline Configuration</h1>
        <p className="text-gray-600 mt-2">
          Configure autonomous pipeline settings for your tenant
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">Configuration saved successfully!</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Performance Settings */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Concurrency Limit
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={config.concurrencyLimit}
                onChange={(e) => updateConfig('concurrencyLimit', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Max parallel operations (1-100)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Batch Size
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={config.batchSize}
                onChange={(e) => updateConfig('batchSize', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Prospects per batch (1-1000)</p>
            </div>
          </div>
        </div>

        {/* Qualification Settings */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Qualification Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pain Score Threshold
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={config.painScoreThreshold}
                onChange={(e) => updateConfig('painScoreThreshold', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum score to qualify (0-100)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hot Lead Percentile
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={config.hotLeadPercentile}
                onChange={(e) => updateConfig('hotLeadPercentile', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Top % routed to human review (0-100)</p>
            </div>
          </div>
        </div>

        {/* Volume & Spending Limits */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Volume & Spending Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Volume Limit
              </label>
              <input
                type="number"
                min="0"
                value={config.dailyVolumeLimit}
                onChange={(e) => updateConfig('dailyVolumeLimit', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Max prospects per day</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Spending Limit (USD)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={spendingLimitDollars}
                onChange={(e) => updateConfig('spendingLimitCents', Math.round(parseFloat(e.target.value) * 100))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Monthly API cost limit</p>
            </div>
          </div>
        </div>

        {/* Email Settings */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Quality Score Minimum
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={config.emailMinQualityScore}
                onChange={(e) => updateConfig('emailMinQualityScore', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Min QA score to send (0-100)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Emails Per Domain Per Day
              </label>
              <input
                type="number"
                min="1"
                value={config.maxEmailsPerDomainPerDay}
                onChange={(e) => updateConfig('maxEmailsPerDomainPerDay', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Daily send limit per domain</p>
            </div>
          </div>
        </div>

        {/* Localization Settings */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Localization Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Country
              </label>
              <select
                value={config.country}
                onChange={(e) => updateConfig('country', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="US">United States</option>
                <option value="UK">United Kingdom</option>
                <option value="CA">Canada</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                value={config.language}
                onChange={(e) => updateConfig('language', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="en">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-CA">English (CA)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <select
                value={config.currency}
                onChange={(e) => updateConfig('currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="USD">USD ($)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pricing Settings */}
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pricing Settings</h2>
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pricing Multiplier
            </label>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={config.pricingMultiplier}
              onChange={(e) => updateConfig('pricingMultiplier', parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Multiply base prices by this factor (0.1-10)</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Info Panel */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Configuration Info</h3>
        <div className="text-xs text-blue-800 space-y-1">
          <p>Last updated: {new Date(config.updatedAt).toLocaleString()}</p>
          <p>Config ID: {config.id}</p>
        </div>
      </div>
    </div>
  );
}
