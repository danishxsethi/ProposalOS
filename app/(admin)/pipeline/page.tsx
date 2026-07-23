/**
 * Pipeline Admin Dashboard
 * 
 * Displays real-time pipeline metrics, human review queue, and manual override controls.
 * 
 * Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7
 */

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface PipelineMetrics {
  discoveredPerDay: number;
  auditsCompletedPerDay: number;
  proposalsGeneratedPerDay: number;
  emailsSentPerDay: number;
  openRate: number;
  replyRate: number;
  conversionRate: number;
  stageErrorRates: Record<string, number>;
}

interface ReviewQueueItem {
  prospect: {
    id: string;
    businessName: string;
    website: string;
    city: string;
    vertical: string;
    pipelineStatus: string;
    engagementScore: number;
  };
  painScore: number;
  painBreakdown: Record<string, number>;
  engagementScore: number;
}

export default function PipelineDashboard() {
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch metrics
      const metricsRes = await fetch('/api/pipeline/metrics');
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);
      }

      // Fetch review queue
      const queueRes = await fetch('/api/pipeline/review?pageSize=10');
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setReviewQueue(queueData.items || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewAction = async (prospectId: string, action: 'approve' | 'reject', reason?: string) => {
    try {
      setActionLoading(true);
      
      const response = await fetch('/api/pipeline/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prospectId,
          action,
          reason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process review action');
      }

      // Refresh queue
      await fetchDashboardData();
      setSelectedProspect(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process action');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pipeline Dashboard</h1>
          <p className="text-gray-600 mt-2">Monitor autonomous pipeline performance and review queue</p>
        </div>
        <Link
          href="/admin/pipeline/config"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Configure Pipeline
        </Link>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Prospects/Day"
            value={metrics.discoveredPerDay}
            icon="👥"
            trend="+12%"
          />
          <MetricCard
            title="Audits/Day"
            value={metrics.auditsCompletedPerDay}
            icon="🔍"
            trend="+8%"
          />
          <MetricCard
            title="Proposals/Day"
            value={metrics.proposalsGeneratedPerDay}
            icon="📄"
            trend="+15%"
          />
          <MetricCard
            title="Emails/Day"
            value={metrics.emailsSentPerDay}
            icon="📧"
            trend="+5%"
          />
        </div>
      )}

      {/* Performance Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <PerformanceCard
            title="Open Rate"
            value={`${(metrics.openRate * 100).toFixed(1)}%`}
            target="40%"
            status={metrics.openRate >= 0.4 ? 'good' : 'warning'}
          />
          <PerformanceCard
            title="Reply Rate"
            value={`${(metrics.replyRate * 100).toFixed(1)}%`}
            target="10%"
            status={metrics.replyRate >= 0.1 ? 'good' : 'warning'}
          />
          <PerformanceCard
            title="Conversion Rate"
            value={`${(metrics.conversionRate * 100).toFixed(1)}%`}
            target="5%"
            status={metrics.conversionRate >= 0.05 ? 'good' : 'warning'}
          />
        </div>
      )}

      {/* Human Review Queue */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Human Review Queue</h2>
          <p className="text-sm text-gray-600 mt-1">
            High-value prospects requiring manual review
          </p>
        </div>

        {reviewQueue.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No prospects in review queue</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {reviewQueue.map((item) => (
              <div key={item.prospect.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">
                        {item.prospect.businessName}
                      </h3>
                      <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded">
                        {item.prospect.vertical}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Website:</span>
                        <p className="text-gray-900 truncate">{item.prospect.website}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">City:</span>
                        <p className="text-gray-900">{item.prospect.city}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Pain Score:</span>
                        <p className="text-gray-900 font-medium">{item.painScore}/100</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Engagement:</span>
                        <p className="text-gray-900 font-medium">{item.engagementScore}/100</p>
                      </div>
                    </div>

                    {/* Pain Breakdown */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(item.painBreakdown).map(([key, value]) => (
                        <span
                          key={key}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                        >
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Link
                      href={`/admin/pipeline/prospects/${item.prospect.id}`}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => handleReviewAction(item.prospect.id, 'approve')}
                      disabled={actionLoading}
                      className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('Rejection reason:');
                        if (reason) {
                          handleReviewAction(item.prospect.id, 'reject', reason);
                        }
                      }}
                      disabled={actionLoading}
                      className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {reviewQueue.length > 0 && (
          <div className="p-4 border-t border-gray-200 text-center">
            <Link
              href="/admin/pipeline/review"
              className="text-purple-600 hover:text-purple-700 text-sm font-medium"
            >
              View All Prospects in Review →
            </Link>
          </div>
        )}
      </div>

      {/* Stage Error Rates */}
      {metrics && Object.keys(metrics.stageErrorRates).length > 0 && (
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Stage Error Rates</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(metrics.stageErrorRates).map(([stage, rate]) => (
              <div key={stage} className="text-center">
                <p className="text-sm text-gray-600 mb-1">{stage}</p>
                <p className={`text-2xl font-bold ${rate > 0.1 ? 'text-red-600' : 'text-green-600'}`}>
                  {(rate * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, trend }: {
  title: string;
  value: number;
  icon: string;
  trend?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {trend && (
          <span className="text-sm text-green-600 font-medium">{trend}</span>
        )}
      </div>
      <h3 className="text-sm text-gray-600 mb-1">{title}</h3>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function PerformanceCard({ title, value, target, status }: {
  title: string;
  value: string;
  target: string;
  status: 'good' | 'warning' | 'error';
}) {
  const statusColors = {
    good: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200',
  };

  const textColors = {
    good: 'text-green-900',
    warning: 'text-yellow-900',
    error: 'text-red-900',
  };

  return (
    <div className={`rounded-lg border p-6 ${statusColors[status]}`}>
      <h3 className="text-sm text-gray-600 mb-1">{title}</h3>
      <p className={`text-3xl font-bold ${textColors[status]}`}>{value}</p>
      <p className="text-sm text-gray-600 mt-2">Target: {target}</p>
    </div>
  );
}
