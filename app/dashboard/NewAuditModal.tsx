'use client';

import { useState } from 'react';
import AuditForm from '@/components/AuditForm';
import { mutate } from 'swr';

export default function NewAuditModal({
    isOpen,
    onClose
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const handleAuditComplete = async (result: any) => {
        // Refresh the audits list
        mutate('/api/audits');
        mutate('/api/stats');

        // Close modal and show success
        onClose();
        alert(`Audit created successfully! ID: ${result.auditId}`);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="card max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">New Audit</h2>
                    <button
                        onClick={onClose}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                        ✕
                    </button>
                </div>
                <AuditForm onAuditComplete={handleAuditComplete} />
            </div>
        </div>
    );
}
