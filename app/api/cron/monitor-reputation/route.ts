
import { NextResponse } from 'next/server';
import { monitorReputation } from '@/lib/monitoring/reputationMonitor';

export const maxDuration = 300; // 5 minutes

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await monitorReputation();
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Reputation Monitor Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
