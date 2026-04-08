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
    <div className="min-h-screen py-8">
      <div className="container">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              <span className="gradient-text">ProposalOS</span>
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-1">Operator Dashboard</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowBatchAudit(true)} className="btn btn-secondary">
              Batch Audit
            </button>
            <button onClick={() => setShowNewAudit(true)} className="btn btn-primary">
              + New Audit
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
