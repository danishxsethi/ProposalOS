'use client';

import { Share2, Download, ExternalLink, Mail, Link2, Linkedin, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePostHog } from '@/hooks/use-posthog';
import { toast } from 'sonner';

interface ReportHeaderProps {
    businessName: string;
    businessUrl: string;
    overallScore: number;
    letterGrade: string;
    token: string;
}

export function ReportHeader({ businessName, businessUrl, overallScore, letterGrade, token }: ReportHeaderProps) {
    const { captureEvent } = usePostHog();

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-blue-500';
        if (score >= 40) return 'text-yellow-500';
        if (score >= 20) return 'text-orange-500';
        return 'text-red-500';
    };

    const getGradeBg = (grade: string) => {
        const g = grade.charAt(0);
        if (g === 'A') return 'bg-green-500/20 text-green-500 border-green-500/20';
        if (g === 'B') return 'bg-blue-500/20 text-blue-500 border-blue-500/20';
        if (g === 'C') return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20';
        if (g === 'D') return 'bg-orange-500/20 text-orange-500 border-orange-500/20';
        return 'bg-red-500/20 text-red-500 border-red-500/20';
    };

    const copyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/report/${token}`);
        toast.success('Link copied to clipboard');
        captureEvent('share_clicked', { platform: 'copy', token });
    };

    return (
        <div className="w-full">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-6">
                {/* Left: Business Info */}
                <div className="flex-1">
                    <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">{businessName}</h1>
                    <a
                        href={`https://${businessUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-text-secondary hover:text-blue-400 transition-colors group"
                    >
                        <span className="text-sm">{businessUrl}</span>
                        <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                </div>

                {/* Center: Score */}
                <div className="flex items-center gap-6 lg:mx-12">
                    <div className="text-center">
                        <div className={`text-6xl lg:text-8xl font-black tracking-tighter ${getScoreColor(overallScore)}`}>
                            {overallScore}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-text-secondary mt-1">
                            Overall Score
                        </div>
                    </div>
                    <Badge className={`text-2xl py-2 px-4 font-bold border rounded-xl ${getGradeBg(letterGrade)}`}>
                        {letterGrade}
                    </Badge>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="flex-1 lg:flex-none border-white/10 hover:bg-white/5">
                                <Share2 className="w-4 h-4 mr-2" />
                                Share
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-bg-card border-white/10 min-w-[160px]">
                            <DropdownMenuItem className="text-white hover:bg-white/5 cursor-pointer" onClick={() => copyLink()}>
                                <Link2 className="w-4 h-4 mr-2 opacity-70" />
                                Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-white hover:bg-white/5 cursor-pointer" onClick={() => captureEvent('share_clicked', { platform: 'linkedin' })}>
                                <Linkedin className="w-4 h-4 mr-2 opacity-70" />
                                LinkedIn
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-white hover:bg-white/5 cursor-pointer" onClick={() => captureEvent('share_clicked', { platform: 'twitter' })}>
                                <Twitter className="w-4 h-4 mr-2 opacity-70" />
                                Twitter (X)
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-white hover:bg-white/5 cursor-pointer" onClick={() => captureEvent('share_clicked', { platform: 'email' })}>
                                <Mail className="w-4 h-4 mr-2 opacity-70" />
                                Email
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="outline" className="hidden sm:flex border-white/10 hover:bg-white/5">
                        <Download className="w-4 h-4 mr-2" />
                        PDF
                    </Button>

                    <Button className="flex-1 lg:flex-none gradient-btn font-bold px-8 shadow-lg shadow-blue-500/20" asChild>
                        <a href={`/proposal/${token}`}>
                            Get Action Plan →
                        </a>
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-text-secondary font-medium tracking-tight mt-8">
                <span>Audited on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                <span className="opacity-20">•</span>
                <span>Powered by Claraud AI Engine</span>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mt-8" />
        </div>
    );
}
