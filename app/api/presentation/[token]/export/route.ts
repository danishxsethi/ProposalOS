import { NextResponse } from 'next/server';

import pptxgen from 'pptxgenjs';

import { getBranding } from '@/lib/config/branding';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { token } = await params;

    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: {
        audit: {
          include: {
            findings: {
              where: { excluded: false },
              orderBy: { impactScore: 'desc' },
            },
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // Create PowerPoint presentation
    const pres = new pptxgen();

    // Get branding
    const branding = await getBranding(proposal.tenantId);

    // Title Slide
    const titleSlide = pres.addSlide();
    titleSlide.background = { color: 'FFFFFF' };

    titleSlide.addText(proposal.audit.businessName, {
      x: 0.5,
      y: 1.5,
      w: '90%',
      h: 1.5,
      fontSize: 44,
      bold: true,
      color: '000000',
      align: 'center',
    });

    titleSlide.addText('Digital Presence Assessment', {
      x: 0.5,
      y: 3.5,
      w: '90%',
      h: 1,
      fontSize: 24,
      color: '666666',
      align: 'center',
    });

    titleSlide.addText(`Prepared by ${branding.name}`, {
      x: 0.5,
      y: 6,
      w: '90%',
      h: 0.5,
      fontSize: 16,
      color: '999999',
      align: 'center',
    });

    // Overall Score Slide
    const healthScore = proposal.audit.findings.length
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              100 -
                (proposal.audit.findings.reduce((sum: number, f: any) => sum + f.impactScore, 0) /
                  proposal.audit.findings.length) *
                  8
            )
          )
        )
      : 85;

    const scoreSlide = pres.addSlide();
    scoreSlide.background = { color: 'F8F9FA' };

    scoreSlide.addText('Overall Digital Health Score', {
      x: 0.5,
      y: 0.5,
      w: '90%',
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '1A1A2E',
      align: 'center',
    });

    scoreSlide.addText(healthScore.toString(), {
      x: 2,
      y: 2,
      w: 3,
      h: 3,
      fontSize: 72,
      bold: true,
      color: healthScore >= 80 ? '22C55E' : healthScore >= 60 ? 'F59E0B' : 'EF4444',
      align: 'center',
    });

    scoreSlide.addText(' / 100', {
      x: 5.2,
      y: 3,
      w: 1,
      h: 1,
      fontSize: 24,
      color: '666666',
    });

    // Categories Slide
    const categoriesSlide = pres.addSlide();
    categoriesSlide.background = { color: 'FFFFFF' };

    categoriesSlide.addText('Performance by Category', {
      x: 0.5,
      y: 0.5,
      w: '90%',
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '1A1A2E',
      align: 'center',
    });

    // Calculate scores by category
    const extractScores = (findings: any[]) => {
      let performance = 0,
        seo = 0,
        accessibility = 0,
        security = 0,
        trust = 0,
        conversion = 0;
      let pCount = 0,
        sCount = 0,
        aCount = 0,
        secCount = 0,
        tCount = 0,
        cCount = 0;

      for (const f of findings) {
        const m = (f.metrics as Record<string, number>) || {};
        if (typeof m.performanceScore === 'number') {
          performance += m.performanceScore;
          pCount++;
        }
        if (typeof m.seoScore === 'number') {
          seo += m.seoScore;
          sCount++;
        }
        if (typeof m.accessibilityScore === 'number') {
          accessibility += m.accessibilityScore;
          aCount++;
        }
        if (f.module === 'security' && typeof m.score === 'number') {
          security += m.score;
          secCount++;
        }
        if (f.module === 'trust' && typeof m.score === 'number') {
          trust += m.score;
          tCount++;
        }
        if (f.module === 'conversion' && typeof m.score === 'number') {
          conversion += m.score;
          cCount++;
        }
      }

      return {
        performance: pCount ? Math.round(performance / pCount) : 0,
        seo: sCount ? Math.round(seo / sCount) : 0,
        accessibility: aCount ? Math.round(accessibility / aCount) : 0,
        security: secCount ? Math.round(security / secCount) : 0,
        trust: tCount ? Math.round(trust / tCount) : 0,
        conversion: cCount ? Math.round(conversion / cCount) : 0,
      };
    };

    const scores = extractScores(proposal.audit.findings);

    const categories = [
      { name: 'Performance', score: scores.performance },
      { name: 'SEO', score: scores.seo },
      { name: 'Accessibility', score: scores.accessibility },
      { name: 'Security', score: scores.security },
      { name: 'Trust', score: scores.trust },
      { name: 'Conversion', score: scores.conversion },
    ];

    // Add category bars
    categories.forEach((cat, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;

      const x = col * 4.5 + 0.5;
      const y = row * 1.2 + 2;

      categoriesSlide.addText(cat.name, {
        x: x,
        y: y,
        w: 2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: '1A1A2E',
      });

      // Progress bar
      categoriesSlide.addShape(pres.ShapeType.rect, {
        x: x,
        y: y + 0.5,
        w: 2,
        h: 0.2,
        fill: { color: 'E5E7EB' },
        line: { color: 'CCCCCC' },
      });

      categoriesSlide.addShape(pres.ShapeType.rect, {
        x: x,
        y: y + 0.5,
        w: (cat.score / 100) * 2,
        h: 0.2,
        fill: { color: cat.score >= 80 ? '22C55E' : cat.score >= 60 ? 'F59E0B' : 'EF4444' },
        line: { color: 'transparent' },
      });

      categoriesSlide.addText(`${cat.score}/100`, {
        x: x,
        y: y + 0.8,
        w: 2,
        h: 0.3,
        fontSize: 12,
        color: '666666',
        align: 'left',
      });
    });

    // Critical Findings Slides
    const criticalFindings = proposal.audit.findings
      .filter((f: any) => f.type === 'PAINKILLER')
      .slice(0, 3);

    criticalFindings.forEach((finding: any, index: number) => {
      const findingSlide = pres.addSlide();
      findingSlide.background = { color: 'FFFFFF' };

      findingSlide.addText(`Critical Issue #${index + 1}: ${finding.title}`, {
        x: 0.5,
        y: 0.5,
        w: '90%',
        h: 0.8,
        fontSize: 24,
        bold: true,
        color: 'DC2626', // red-600
      });

      findingSlide.addText('Description:', {
        x: 0.5,
        y: 1.5,
        w: '90%',
        h: 0.3,
        fontSize: 16,
        bold: true,
        color: '1A1A2E',
      });

      findingSlide.addText(finding.description || 'No description available', {
        x: 0.5,
        y: 2,
        w: '90%',
        h: 2,
        fontSize: 14,
        color: '4B5563',
        wrap: true,
      });

      findingSlide.addText('Business Impact:', {
        x: 0.5,
        y: 4.2,
        w: '90%',
        h: 0.3,
        fontSize: 16,
        bold: true,
        color: '1A1A2E',
      });

      findingSlide.addText(`Impact Score: ${finding.impactScore}/10`, {
        x: 0.5,
        y: 4.7,
        w: '90%',
        h: 0.3,
        fontSize: 14,
        color: 'DC2626',
        bold: true,
      });

      if (finding.recommendedFix?.[0]) {
        findingSlide.addText('Recommended Fix:', {
          x: 0.5,
          y: 5.2,
          w: '90%',
          h: 0.3,
          fontSize: 16,
          bold: true,
          color: '1A1A2E',
        });

        findingSlide.addText(finding.recommendedFix[0], {
          x: 0.5,
          y: 5.7,
          w: '90%',
          h: 1.5,
          fontSize: 14,
          color: '4B5563',
          wrap: true,
        });
      }
    });

    // Action Plan Slide
    const actionSlide = pres.addSlide();
    actionSlide.background = { color: 'F8F9FA' };

    actionSlide.addText('Your 90-Day Roadmap', {
      x: 0.5,
      y: 0.5,
      w: '90%',
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '1A1A2E',
      align: 'center',
    });

    const phases = [
      {
        title: 'Phase 1: Quick Wins',
        weeks: 'Weeks 1-2',
        items: ['Fix Google Business Profile', 'Respond to Reviews', 'Site Speed Tuning'],
      },
      {
        title: 'Phase 2: Foundations',
        weeks: 'Weeks 3-6',
        items: ['Landing Page Optimization', 'Content Expansion', 'Citation Building'],
      },
      {
        title: 'Phase 3: Growth',
        weeks: 'Weeks 7-12',
        items: ['SEO Campaign Launch', 'Review Generation System', 'Social Ads'],
      },
    ];

    phases.forEach((phase, index) => {
      const x = index * 3 + 0.5;

      actionSlide.addText(phase.title, {
        x: x,
        y: 2,
        w: 2.5,
        h: 0.5,
        fontSize: 16,
        bold: true,
        color: '1A1A2E',
      });

      actionSlide.addText(phase.weeks, {
        x: x,
        y: 2.6,
        w: 2.5,
        h: 0.3,
        fontSize: 12,
        color: '6B7280',
      });

      phase.items.forEach((item, itemIndex) => {
        actionSlide.addText(`• ${item}`, {
          x: x,
          y: 3.1 + itemIndex * 0.4,
          w: 2.5,
          h: 0.3,
          fontSize: 12,
          color: '4B5563',
        });
      });
    });

    // Generate the presentation
    const buffer = await pres.write({ outputType: 'nodebuffer' });

    return new NextResponse(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="presentation-${proposal.audit.businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${token.substring(0, 8)}.pptx"`,
      },
    });
  } catch (error) {
    logger.error('Presentation export error:', error);
    return NextResponse.json({ error: 'Failed to generate presentation' }, { status: 500 });
  }
}
