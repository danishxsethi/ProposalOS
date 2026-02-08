
// Simple in-memory metrics (resets on container restart)
// In production (Cloud Run), these would ideally be exported to Cloud Monitoring

interface Metrics {
    audits_total: number;
    audits_failed: number;
    modules_total: number;
    modules_failed: number;
    [key: string]: number;
}

// Global metrics store
const metrics: Metrics = {
    audits_total: 0,
    audits_failed: 0,
    modules_total: 0,
    modules_failed: 0,
};

export const Metrics = {
    increment: (metric: keyof Metrics) => {
        metrics[metric] = (metrics[metric] || 0) + 1;
    },

    get: () => ({ ...metrics }),
    getAll: () => ({ ...metrics }),

    reset: () => {
        Object.keys(metrics).forEach(key => {
            metrics[key] = 0;
        });
    }
};
