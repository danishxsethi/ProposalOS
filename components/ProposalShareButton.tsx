'use client';

import { useState } from 'react';

interface ProposalShareButtonProps {
    proposalId: string;
    businessName: string;
    token: string;
}

export function ProposalShareButton({ proposalId, businessName, token }: ProposalShareButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const proposalUrl = `${origin}/proposal/${token}`;
    const shareSubject = `${businessName} — Digital Presence Audit`;
    const shareBody = `I wanted to share this digital presence audit for ${businessName} with you:\n\n${proposalUrl}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(shareBody)}`;

    const showToast = () => {
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 2500);
    };

    const trackShare = async (platform: string) => {
        try {
            await fetch(`/api/proposal/${token}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform })
            });
        } catch (error) {
            console.error('Failed to track share:', error);
        }
    };

    const copyToClipboard = async () => {
        if (typeof window === 'undefined') return;

        try {
            await navigator.clipboard.writeText(proposalUrl);
            setCopied(true);
            showToast();
            setTimeout(() => setCopied(false), 2500);
            await trackShare('copy');
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const handlePlatformClick = (platform: string) => {
        trackShare(platform);
    };

    if (!isOpen) {
        return (
            <>
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 bg-[#4361ee] hover:bg-[#3b52d4] text-white rounded-full p-4 shadow-lg hover:scale-105 transition-transform duration-200 flex items-center gap-2 min-h-[44px] min-w-[44px]"
                    aria-label="Share this report"
                >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="font-medium hidden sm:inline">Share This Report</span>
            </button>
                {toastVisible && (
                    <div className="fixed bottom-24 md:bottom-16 right-4 md:right-6 z-[60] px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg shadow-lg">
                        Link copied to clipboard!
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50">
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl p-6 mb-4 w-80 max-w-[calc(100vw-2rem)]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-bold text-lg">Share This Report</h3>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-slate-400 hover:text-white transition"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <p className="text-white/60 text-sm mb-4">
                    Copy the link or share via email
                </p>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={copyToClipboard}
                        className="bg-[#4361ee] hover:bg-[#3b52d4] text-white px-4 py-3 rounded-lg font-medium transition flex items-center gap-3 min-h-[44px]"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {copied ? '✓ Copied!' : 'Copy Link'}
                    </button>
                    <a
                        href={mailtoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackShare('email')}
                        className="bg-white/10 hover:bg-white/15 text-white px-4 py-3 rounded-lg font-medium transition flex items-center gap-3 min-h-[44px]"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Share via Email
                    </a>
                    <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareSubject)}&url=${encodeURIComponent(proposalUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handlePlatformClick('twitter')}
                        className="bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] px-4 py-3 rounded-lg font-medium transition flex items-center gap-3"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                        </svg>
                        Share on Twitter
                    </a>

                    <a
                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(proposalUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handlePlatformClick('linkedin')}
                        className="bg-[#0077b5]/20 hover:bg-[#0077b5]/30 text-[#0077b5] px-4 py-3 rounded-lg font-medium transition flex items-center gap-3"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                        Share on LinkedIn
                    </a>

                    <a
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(proposalUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handlePlatformClick('facebook')}
                        className="bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] px-4 py-3 rounded-lg font-medium transition flex items-center gap-3"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        Share on Facebook
                    </a>

                </div>

                {toastVisible && (
                    <div className="mt-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg text-center">
                        Link copied to clipboard!
                    </div>
                )}
            </div>
        </div>
    );
}
