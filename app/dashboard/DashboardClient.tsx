'use client';

import { useState } from 'react';

import AuditTable from './AuditTable';
import BatchAuditModal from './BatchAuditModal';
import NewAuditModal from './NewAuditModal';
import StatsBar from './StatsBar';

export default function DashboardClient() {
  const [showNewAudit, setShowNewAudit] = useState(false);
  const [showBatchAudit, setShowBatchAudit] = useState(false);

  return (
    <div className="min-w-0">
      <div className="min-w-0">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Audits</h1>
            <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
              Every audit your workspace has run, with score, status and proposal state.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowBatchAudit(true)} className="btn btn-secondary">
              Batch audit
            </button>
            <button onClick={() => setShowNewAudit(true)} className="btn btn-primary">
              + New audit
            </button>
          </div>
        </div>

        {/* Stats */}
        <StatsBar />

        {/* Table */}
        <AuditTable />

        {/* Modals */}
        <NewAuditModal isOpen={showNewAudit} onClose={() => setShowNewAudit(false)} />
        <BatchAuditModal isOpen={showBatchAudit} onClose={() => setShowBatchAudit(false)} />
      </div>
    </div>
  );
}
