import { Resend } from 'resend';


interface EmailParams {
    to: string;
    businessName: string;
    proposalUrl: string;
    pdfUrl: string;
}

export async function sendProposalEmail({ to, businessName, proposalUrl, pdfUrl }: EmailParams) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY is missing. Email sending skipped.');
        return { success: false, error: 'Missing API key' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
        const { data, error } = await resend.emails.send({
            from: 'ProposalOS <onboarding@resend.dev>', // Default Resend testing domain
            to: [to],
            subject: `Proposal for ${businessName} - Action Required`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #2563eb;">Your Audit & Proposal is Ready</h1>
                    <p>Hello,</p>
                    <p>We've completed the comprehensive digital audit for <strong>${businessName}</strong>.</p>
                    <p>We found several key opportunities to improve your online presence and increase revenue.</p>
                    
                    <div style="margin: 30px 0;">
                        <a href="${proposalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Interactive Proposal</a>
                    </div>
                    
                    <p>You can also download the PDF version directly:</p>
                    <p><a href="${pdfUrl}">Download PDF Report</a></p>
                    
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
                    
                    <p style="color: #6b7280; font-size: 14px;">
                        Powered by ProposalOS<br />
                        Automated capable AI agent for business growth
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('Resend API Error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, data };
    } catch (error) {
        console.error('Email sending failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
