import { useQuery } from '@tanstack/react-query';

export function useAudits(page = 1, limit = 50) {
    return useQuery({
        queryKey: ['audits', page, limit],
        queryFn: async () => {
            const res = await fetch(`/api/audits?page=${page}&limit=${limit}`);
            if (!res.ok) throw new Error('Failed to fetch audits');
            return res.json();
        },
    });
}

export function useProposals() {
    return useQuery({
        queryKey: ['proposals'],
        queryFn: async () => {
            const res = await fetch(`/api/proposals`);
            if (!res.ok) throw new Error('Failed to fetch proposals');
            return res.json();
        },
    });
}

export function useProposal(token: string) {
    return useQuery({
        queryKey: ['proposal', token],
        queryFn: async () => {
            if (!token) throw new Error('No token provided');
            const res = await fetch(`/api/proposals/${token}`);
            if (!res.ok) throw new Error('Failed to fetch proposal');
            return res.json();
        },
        enabled: !!token,
    });
}

export function useReport(token: string) {
    return useQuery({
        queryKey: ['report', token],
        queryFn: async () => {
            if (!token) throw new Error('No token provided');
            const res = await fetch(`/api/report/${token}`);
            if (!res.ok) throw new Error('Failed to fetch report');
            return res.json();
        },
        enabled: !!token,
    });
}

export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const res = await fetch('/api/dashboard/stats');
            if (!res.ok) throw new Error('Failed to fetch dashboard stats');
            return res.json();
        },
    });
}

export function usePipeline() {
    return useQuery({
        queryKey: ['pipeline'],
        queryFn: async () => {
            // Reusing proposals endpoint since pipeline is just grouped proposals
            const res = await fetch('/api/proposals');
            if (!res.ok) throw new Error('Failed to fetch pipeline data');
            return res.json();
        },
    });
}

export function useAnalytics() {
    return useQuery({
        queryKey: ['analytics'],
        queryFn: async () => {
            const res = await fetch('/api/analytics');
            if (!res.ok) throw new Error('Failed to fetch analytics data');
            return res.json();
        },
    });
}
