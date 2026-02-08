'use client';

import { useState } from 'react';

interface SocialShareProps {
    score: number;
    businessName: string;
    auditId: string; // Token?
}

export function SocialShare({ score, businessName, auditId }: SocialShareProps) {
    const [copied, setCopied] = useState(false);

    // The link we want to spread is the top-of-funnel Free Audit
    // But maybe with a ?ref=auditId param to track virality
    const shareUrl = \`https://proposalengine.com/free-audit?ref=\${auditId}\`;
    
    const text = \`Just got my digital presence score for \${businessName}: \${score}/100 😱 Check yours free:\`;

    const links = {
        twitter: \`https://twitter.com/intent/tweet?text=\${encodeURIComponent(text)}&url=\${encodeURIComponent(shareUrl)}\`,
        linkedin: \`https://www.linkedin.com/sharing/share-offsite/?url=\${encodeURIComponent(shareUrl)}\`, // LinkedIn picks up OG tags
        facebook: \`https://www.facebook.com/sharer/sharer.php?u=\${encodeURIComponent(shareUrl)}\`,
        email: \`mailto:?subject=Check out this score&body=\${encodeURIComponent(text + ' ' + shareUrl)}\`
    };

    const copyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
            <h3 className="text-white font-bold mb-4">Share your score</h3>
            <div className="flex gap-4 flex-wrap">
                <a href={links.twitter} target="_blank" rel="noopener noreferrer" 
                   className="bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
                   🐦 Twitter
                </a>
                <a href={links.linkedin} target="_blank" rel="noopener noreferrer" 
                   className="bg-[#0077b5]/20 hover:bg-[#0077b5]/30 text-[#0077b5] px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
                   💼 LinkedIn
                </a>
                <a href={links.facebook} target="_blank" rel="noopener noreferrer" 
                   className="bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
                   📘 Facebook
                </a>
                 <button onClick={copyLink} 
                   className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2">
                   🔗 {copied ? 'Copied' : 'Copy Link'}
                </button>
            </div>
            <p className="text-xs text-slate-500 mt-4">
                Sharing helps us benchmark more businesses in your industry, making your report more accurate.
            </p>
        </div>
    );
}
