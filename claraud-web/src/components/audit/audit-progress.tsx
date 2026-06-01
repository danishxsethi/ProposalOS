'use client';

import * as React from 'react';

import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock, Loader2, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export interface AuditModule {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  estimatedTime?: number; // seconds
  actualTime?: number; // seconds
  error?: string;
  icon?: string;
}

interface AuditProgressProps {
  modules: AuditModule[];
  overallProgress?: number;
  estimatedTotalTime?: number;
  elapsedTime?: number;
  businessName?: string;
  businessUrl?: string;
}

const statusIcons = {
  pending: <Clock className="w-4 h-4" />,
  running: <Loader2 className="w-4 h-4 animate-spin" />,
  completed: <CheckCircle2 className="w-4 h-4" />,
  failed: <AlertCircle className="w-4 h-4" />,
};

const statusColors = {
  pending: 'bg-white/5 border-white/10 text-text-secondary',
  running: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  completed: 'bg-green-500/10 border-green-500/20 text-green-400',
  failed: 'bg-red-500/10 border-red-500/20 text-red-400',
};

const moduleIcons: Record<string, React.ReactNode> = {
  website: <Zap className="w-4 h-4" />,
  google: <CheckCircle2 className="w-4 h-4" />,
  seo: <Zap className="w-4 h-4" />,
  reviews: <CheckCircle2 className="w-4 h-4" />,
  social: <Zap className="w-4 h-4" />,
  competitors: <CheckCircle2 className="w-4 h-4" />,
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function AuditProgress({
  modules,
  overallProgress = 0,
  estimatedTotalTime = 180,
  elapsedTime = 0,
  businessName = 'Your Business',
}: AuditProgressProps) {
  const remainingTime = Math.max(0, estimatedTotalTime - elapsedTime);
  const completedModules = modules.filter((m) => m.status === 'completed').length;
  const failedModules = modules.filter((m) => m.status === 'failed').length;
  const runningModule = modules.find((m) => m.status === 'running');

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Auditing {businessName}</h2>
        <p className="text-text-secondary">
          Analyzing {modules.length} dimensions of your online presence
        </p>
      </div>

      {/* Overall Progress */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Overall Progress</span>
          <span className="text-sm font-bold text-white">{Math.round(overallProgress)}%</span>
        </div>
        <Progress value={overallProgress} className="h-2" />

        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            {completedModules} of {modules.length} modules complete
          </span>
          {remainingTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />~{formatTime(remainingTime)} remaining
            </span>
          )}
        </div>
      </div>

      {/* Current Activity */}
      {runningModule && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{runningModule.name}</p>
            <p className="text-xs text-text-secondary">{runningModule.description}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono text-blue-400">{runningModule.progress}%</p>
          </div>
        </motion.div>
      )}

      {/* Module List */}
      <div className="space-y-3">
        {modules.map((module, index) => (
          <motion.div
            key={module.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`border rounded-xl p-4 transition-all ${
              module.status === 'running'
                ? 'bg-blue-500/10 border-blue-500/20'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className={`p-2 rounded-lg ${statusColors[module.status]}`}>
                {statusIcons[module.status]}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white truncate">{module.name}</h3>
                  {module.status === 'completed' && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20"
                    >
                      Done
                    </Badge>
                  )}
                  {module.status === 'failed' && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20"
                    >
                      Failed
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary truncate">{module.description}</p>

                {/* Module Progress Bar */}
                {module.status === 'running' && (
                  <div className="mt-2">
                    <Progress value={module.progress} className="h-1.5" />
                  </div>
                )}
              </div>

              {/* Time/Status */}
              <div className="text-right text-xs text-text-secondary">
                {module.status === 'completed' && module.actualTime && (
                  <span>{formatTime(module.actualTime)}</span>
                )}
                {module.status === 'running' && module.estimatedTime && (
                  <span>~{formatTime(module.estimatedTime)}</span>
                )}
                {module.status === 'pending' && (
                  <span className="text-text-secondary/50">Waiting...</span>
                )}
                {module.status === 'failed' && <span className="text-red-400">Error</span>}
              </div>
            </div>

            {/* Error Message */}
            {module.status === 'failed' && module.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg"
              >
                <p className="text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" />
                  {module.error}
                </p>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Summary Stats */}
      {completedModules > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-4"
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-400">{completedModules}</p>
              <p className="text-xs text-text-secondary">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">
                {modules.filter((m) => m.status === 'running').length}
              </p>
              <p className="text-xs text-text-secondary">In Progress</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-secondary">
                {modules.filter((m) => m.status === 'pending').length}
              </p>
              <p className="text-xs text-text-secondary">Pending</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
