import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

// Simplified SVG for radar chart visualization
const createRadarSVG = () => {
    return `
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="50" stroke="url(#radarGradient)" stroke-width="1" stroke-opacity="0.3"/>
            <circle cx="60" cy="60" r="35" stroke="url(#radarGradient)" stroke-width="1" stroke-opacity="0.5"/>
            <circle cx="60" cy="60" r="20" stroke="url(#radarGradient)" stroke-width="1" stroke-opacity="0.7"/>
            <path d="M60 10 L95 40 L95 80 L60 110 L25 80 L25 40 Z" stroke="url(#radarGradient)" stroke-width="1.5" stroke-opacity="0.8" fill="none"/>
            <path d="M60 10 L60 110" stroke="url(#radarGradient)" stroke-width="0.5" stroke-opacity="0.4"/>
            <path d="M25 40 L95 80" stroke="url(#radarGradient)" stroke-width="0.5" stroke-opacity="0.4"/>
            <path d="M95 40 L25 80" stroke="url(#radarGradient)" stroke-width="0.5" stroke-opacity="0.4"/>
            <circle cx="60" cy="10" r="3" fill="#3b82f6"/>
            <circle cx="95" cy="40" r="3" fill="#3b82f6"/>
            <circle cx="95" cy="80" r="3" fill="#3b82f6"/>
            <circle cx="60" cy="110" r="3" fill="#3b82f6"/>
            <circle cx="25" cy="80" r="3" fill="#3b82f6"/>
            <circle cx="25" cy="40" r="3" fill="#3b82f6"/>
            <defs>
                <linearGradient id="radarGradient" x1="0" y1="0" x2="120" y2="120">
                    <stop offset="0%" stop-color="#3b82f6"/>
                    <stop offset="100%" stop-color="#8b5cf6"/>
                </linearGradient>
            </defs>
        </svg>
    `;
};

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    // Fetch report data
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let reportData: {
        businessName: string;
        overallScore: number;
        letterGrade: string;
    };

    try {
        const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: 'no-store' });
        if (res.ok) {
            reportData = await res.json();
        } else {
            // Fallback to mock data
            reportData = {
                businessName: 'Saskatoon Family Dental',
                overallScore: 49,
                letterGrade: 'D+'
            };
        }
    } catch (e) {
        reportData = {
            businessName: 'Business Name',
            overallScore: 0,
            letterGrade: 'F'
        };
    }

    // Get score color based on score
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#22c55e'; // green
        if (score >= 60) return '#3b82f6'; // blue
        if (score >= 40) return '#f59e0b'; // yellow
        if (score >= 20) return '#f97316'; // orange
        return '#ef4444'; // red
    };

    const scoreColor = getScoreColor(reportData.overallScore);

    // Create SVG for OG image
    const svg = `
        <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#0a0a0f"/>
                    <stop offset="100%" stop-color="#111827"/>
                </linearGradient>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="${scoreColor}"/>
                    <stop offset="100%" stop-color="#8b5cf6"/>
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            
            <!-- Background -->
            <rect width="1200" height="630" fill="url(#bgGradient)"/>
            
            <!-- Decorative gradients -->
            <circle cx="100" cy="100" r="300" fill="#3b82f6" opacity="0.08"/>
            <circle cx="1100" cy="530" r="250" fill="#8b5cf6" opacity="0.08"/>
            
            <!-- Left side: Business info -->
            <g transform="translate(60, 180)">
                <text x="0" y="0" font-family="Inter, Arial, sans-serif" font-size="48" fill="#f9fafb" font-weight="600" style="font-variant-numeric: tabular-nums;">
                    ${reportData.businessName}
                </text>
                <text x="0" y="60" font-family="Inter, Arial, sans-serif" font-size="24" fill="#9ca3af" font-weight="400">
                    AI Business Audit Report
                </text>
            </g>
            
            <!-- Center: Score display -->
            <g transform="translate(600, 250)">
                <text x="0" y="0" font-family="Inter, Arial, sans-serif" font-size="180" font-weight="900" fill="url(#scoreGradient)" filter="url(#glow)" text-anchor="middle" style="font-variant-numeric: tabular-nums;">
                    ${reportData.overallScore}
                </text>
                <text x="0" y="60" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="700" fill="#f9fafb" text-anchor="middle" letter-spacing="2">
                    ${reportData.letterGrade}
                </text>
                <text x="0" y="100" font-family="Inter, Arial, sans-serif" font-size="24" fill="#9ca3af" text-anchor="middle">
                    Overall Score
                </text>
            </g>
            
            <!-- Right side: Radar visualization -->
            <g transform="translate(950, 150)">
                ${createRadarSVG()}
            </g>
            
            <!-- Bottom: Powered by Claraud -->
            <g transform="translate(600, 520)">
                <text x="0" y="0" font-family="Inter, Arial, sans-serif" font-size="28" fill="#9ca3af" text-anchor="middle" font-weight="500">
                    Powered by Claraud
                </text>
                <text x="0" y="40" font-family="Inter, Arial, sans-serif" font-size="24" fill="#3b82f6" text-anchor="middle" font-weight="600">
                    claraud.com
                </text>
            </g>
        </svg>
    `;

    // Convert SVG to PNG using sharp
    try {
        const pngBuffer = await sharp(Buffer.from(svg))
            .resize(1200, 630)
            .png()
            .toBuffer();

        const response = new NextResponse(new Uint8Array(pngBuffer), {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            },
        });

        return response;
    } catch (error) {
        console.error('Error generating OG image:', error);
        
        // Fallback: return a simple PNG with error message
        const errorSvg = `
            <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
                <rect width="1200" height="630" fill="#0a0a0f"/>
                <text x="600" y="300" font-family="Arial" font-size="48" fill="#f9fafb" text-anchor="middle">
                    Error generating report preview
                </text>
                <text x="600" y="360" font-family="Arial" font-size="24" fill="#9ca3af" text-anchor="middle">
                    ${reportData.businessName}
                </text>
                <text x="600" y="420" font-family="Arial" font-size="24" fill="#9ca3af" text-anchor="middle">
                    Score: ${reportData.overallScore} - ${reportData.letterGrade}
                </text>
            </svg>
        `;
        
        const errorPng = await sharp(Buffer.from(errorSvg))
            .resize(1200, 630)
            .png()
            .toBuffer();
            
        return new NextResponse(new Uint8Array(errorPng), {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    }
}