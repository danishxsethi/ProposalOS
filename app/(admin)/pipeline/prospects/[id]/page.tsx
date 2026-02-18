/**
 * Detailed Prospect View
 * 
 * Shows complete prospect history, state transitions, audit results,
 * proposal details, engagement events, and allows manual interventions.
 * 
 * Requirements: 10.3, 10.7
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ProspectDetails {
  prospect: {
    id: string;
    businessName: string;
    website: string;
    city: string;
    vertical: string;
    pipelineStatus: string;
    engagementScore: number;
    createdAt: string;
    updatedAt: string;
  };
  painScore: number;
  painBreakdown: Record<string, number>;
  engagementScore: number;
  stateHistory: Array<{
    from: string;
    to: string;
    timestamp: string;
    stage: string;
  }>;
}

export default function ProspectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const prospectId = params.id as string;

  const [prospect, setProspect] = useState<ProspectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchProspectDetails();
  }, [prospectId]);

  const fetchProspectDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/pipeline/prospects/${prospectId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch prospect details');
      }

      const data = await response.json();
      setProspect(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prospect');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusOverride = async () => {
    const newStatus = prompt('Enter new status:');
    if (!newStatus) return;

    const reason = prompt('Reason for override:');
    if (!reason) return;

    try {
      setActionLoading(true);
      
      const response = await fetch(`/api/pipeline/prospects/${prospectId}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newStatus,
          reason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to override status');
      }

      await fetchProspectDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to override status');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !prospect) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Prospect not found'}</p>
          <Link href="/admin/pipeline" className="text-red-600 hover:text-red-700 text-sm mt-2 inline-block">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/pipeline" className="text-purple-600 hover:text-purple-700 text-sm mb-4 inline-block">
          ← Back to Dashboard
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{prospect.prospect.businessName}</h1>
            <p className="text-gray-600 mt-2">{prospect.prospect.website}</p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              prospect.prospect.pipelineStatus === 'hot_lead' 
                ? 'bg-yellow-100 text-yellow-800'
                : prospect.prospect.pipelineStatus === 'closed_won'
                ? 'bg-green-100 text-green-800'
                : prospect.prospect.pipelineStatus === 'closed_lost'
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {prospect.prospect.pipelineStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm text-gray-600 mb-1">Pain Score</h3>
          <p className="text-3xl font-bold text-gray-900">{prospect.painScore}/100</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm text-gray-600 mb-1">Engagement Score</h3>
          <p className="text-3xl font-bold text-gray-900">{prospect.engagementScore}/100</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm text-gray-600 mb-1">Vertical</h3>
          <p className="text-xl font-medium text-gray-900">{prospect.prospect.vertical}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm text-gray-600 mb-1">City</h3>
          <p className="text-xl font-medium text-gray-900">{prospect.prospect.city}</p>
        </div>
      </div>

      {/* Pain Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pain Score Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(prospect.painBreakdown).map(([key, value]) => (
            <div key={key} className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">{key}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* State History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">State Transition History</h2>
        <div className="space-y-4">
          {prospect.stateHistory.map((transition, index) => (
            <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm font-medium">
                    {transition.from}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-medium">
                    {transition.to}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Stage: {transition.stage}
                </p>
              </div>
              <div className="text-right text-sm text-gray-500">
                {new Date(transition.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Interventions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Manual Interventions</h2>
        <div className="flex gap-4">
          <button
            onClick={handleStatusOverride}
            disabled={actionLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            Override Status
          </button>
          <button
            onClick={() => router.push(`/audit/${prospect.prospect.id}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Audit Results
          </button>
          <button
            onClick={() => router.push(`/proposal/${prospect.prospect.id}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Proposal
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Prospect Metadata</h3>
        <div className="text-xs text-blue-800 space-y-1">
          <p>ID: {prospect.prospect.id}</p>
          <p>Created: {new Date(prospect.prospect.createdAt).toLocaleString()}</p>
          <p>Last Updated: {new Date(prospect.prospect.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
