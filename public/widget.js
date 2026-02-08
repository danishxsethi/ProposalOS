(function () {
    // proposalengine.com/widget.js

    // 1. Get Config
    const script = document.currentScript;
    const tenantId = script.getAttribute('data-tenant');
    const primaryColor = script.getAttribute('data-color') || '#6366f1'; // Indigo-500 default

    if (!tenantId) {
        console.error('ProposalOS Widget: data-tenant attribute missing');
        return;
    }

    // 2. Create Floating Button
    const btn = document.createElement('div');
    btn.id = 'proposal-os-widget-btn';
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: primaryColor,
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        zIndex: '999998',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.2s',
        color: 'white',
        fontSize: '24px',
        fontFamily: 'sans-serif'
    });
    btn.innerHTML = '⚡️';
    btn.onclick = toggleModal;
    document.body.appendChild(btn);

    // 3. Create Modal
    const modal = document.createElement('div');
    modal.id = 'proposal-os-widget-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        bottom: '100px',
        right: '20px',
        width: '350px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        zIndex: '999999',
        display: 'none',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        opacity: '0',
        transition: 'opacity 0.2s, transform 0.2s',
        transform: 'translateY(20px)'
    });

    // Modal Content
    modal.innerHTML = \`
        <div style="background: \${primaryColor}; padding: 20px; color: white;">
            <h3 style="margin:0; font-size: 18px; font-weight: 700;">Get Your Free Website Score</h3>
            <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">See how you stack up against competitors.</p>
        </div>
        <div style="padding: 20px;">
            <form id="pos-form">
                <input type="text" id="pos-business" placeholder="Business Name" required 
                    style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
                <input type="url" id="pos-url" placeholder="Website URL (https://...)" required 
                    style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
                <button type="submit" 
                    style="width: 100%; background: \${primaryColor}; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer;">
                    Analyze Now
                </button>
            </form>
            <div id="pos-result" style="display:none; text-align: center; padding-top: 10px;">
                <div style="font-size: 48px; font-weight: 800; color: \${primaryColor}; margin-bottom: 10px;" id="pos-score">--</div>
                <div style="font-weight: 600; margin-bottom: 5px;" id="pos-grade"></div>
                <p style="font-size: 12px; color: #666; margin-bottom: 15px;" id="pos-issue"></p>
                <a id="pos-link" href="#" target="_blank" 
                   style="display: block; background: #111; color: white; padding: 10px; text-decoration: none; border-radius: 6px; font-size: 13px;">
                   Unlock Full Report
                </a>
            </div>
            <div id="pos-loading" style="display:none; text-align: center; padding: 20px;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #ddd; border-top-color: \${primaryColor}; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="font-size: 12px; color: #999; margin-top: 10px;">Analyzing...</p>
            </div>
        </div>
        <div style="background: #f9fafb; padding: 10px; text-align: center; border-top: 1px solid #eee;">
            <a href="https://proposalengine.com" target="_blank" style="text-decoration: none; color: #999; font-size: 10px; font-weight: 600; text-transform: uppercase;">
                Powered by ProposalOS
            </a>
        </div>
        <style>
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
    \`;

    // Close Button
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '10px',
        right: '15px',
        color: 'white',
        fontSize: '24px',
        cursor: 'pointer',
        fontWeight: 'bold'
    });
    closeBtn.onclick = toggleModal;
    modal.querySelector('div').appendChild(closeBtn); // Add to header

    document.body.appendChild(modal);

    // 4. Logic
    let isOpen = false;
    function toggleModal() {
        isOpen = !isOpen;
        modal.style.display = 'block';
        // forced reflow
        modal.offsetHeight; 
        modal.style.opacity = isOpen ? '1' : '0';
        modal.style.transform = isOpen ? 'translateY(0)' : 'translateY(20px)';
        
        if (!isOpen) {
            setTimeout(() => modal.style.display = 'none', 200);
        }
    }

    const form = document.getElementById('pos-form');
    const resultDiv = document.getElementById('pos-result');
    const loadingDiv = document.getElementById('pos-loading');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const businessName = document.getElementById('pos-business').value;
        const websiteUrl = document.getElementById('pos-url').value;

        form.style.display = 'none';
        loadingDiv.style.display = 'block';

        try {
            const apiHost = script.src.split('/widget.js')[0]; // Auto-detect host
            const res = await fetch(\`\${apiHost}/api/widget/quick-audit\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessName, websiteUrl, tenantId })
            });
            
            const data = await res.json();
            
            loadingDiv.style.display = 'none';
            resultDiv.style.display = 'block';
            
            document.getElementById('pos-score').innerText = data.score;
            document.getElementById('pos-grade').innerText = \`Grade: \${data.grade}\`;
            document.getElementById('pos-issue').innerText = \`Top Issue: \${data.topIssue}\`;
            // Link to the full report / preview
            // For now, we link to the general free-audit page pre-filled logic IF we had it,
            // or a specific proposal preview if the audit created it.
            // Sending them to /free-audit for now as "Unlock"
            document.getElementById('pos-link').href = \`\${apiHost}/free-audit?url=\${encodeURIComponent(websiteUrl)}&name=\${encodeURIComponent(businessName)}\`;

        } catch (error) {
            console.error(error);
            loadingDiv.style.display = 'none';
            form.style.display = 'block'; // Reset
            alert('Something went wrong. Please try again.');
        }
    };

})();
