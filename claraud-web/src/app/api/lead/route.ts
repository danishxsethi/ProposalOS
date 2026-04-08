import { NextRequest, NextResponse } from 'next/server';

import { emailScheduler } from '@/lib/email-scheduler';
import { mockReportData } from '@/lib/mock-data';
import { sendReportEmail } from '@/lib/resend';
import { leadStore } from '@/lib/stores';

// Thorough email validation
function isValidEmail(email: string): boolean {
  const re =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return re.test(email) && email.length <= 254;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, businessUrl, scanToken, scores } = body;

    // Validate
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    if (!scanToken) {
      return NextResponse.json({ error: 'Scan token is required' }, { status: 400 });
    }

    // Store lead
    leadStore.set(scanToken, { email, businessUrl, scanToken, scores, capturedAt: new Date() });

    // Calculate overall score for email (/10 scale)
    const scoresList = Object.values(scores || {}) as number[];
    const overallScore =
      scoresList.length > 0
        ? Math.round((scoresList.reduce((a, b) => a + b, 0) / scoresList.length) * 10) / 10
        : 4.9;

    // Get letter grade
    const getLetterGrade = (score: number) => {
      if (score >= 9) return 'A+';
      if (score >= 8) return 'A';
      if (score >= 7) return 'B';
      if (score >= 6) return 'C';
      if (score >= 5) return 'D';
      return 'F';
    };
    const letterGrade = getLetterGrade(overallScore);

    // Get top findings for email
    const topFindings = [
      { title: 'Website Performance', severity: 'high' },
      { title: 'SEO Optimization', severity: 'medium' },
      { title: 'Google Business Profile', severity: 'low' },
    ];

    // Send report email via Resend (if configured)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://claraud.com';
    const reportUrl = `${appUrl}/report/${scanToken}`;

    await sendReportEmail({
      to: email,
      businessName: businessUrl || 'your business',
      overallScore,
      letterGrade,
      topFindings,
      reportUrl,
    });

    // Schedule drip sequence
    emailScheduler.scheduleSequence(
      { email, businessName: businessUrl || 'your business' },
      mockReportData
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[lead] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
