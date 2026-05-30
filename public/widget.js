/**
 * ProposalOS Widget v2.0 - Sandboxed Web Component
 *
 * Usage:
 * <script src="https://your-domain.com/widget.js"
 *         data-tenant="your-tenant-id"
 *         data-color="#6366f1"
 *         data-position="bottom-right"
 *         async></script>
 *
 * Features:
 * - Shadow DOM for complete CSS isolation
 * - Configurable positioning and branding
 * - CORS-safe API communication
 * - Graceful degradation for old browsers
 */
(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__ProposalOSWidgetLoaded__) {
    console.warn('[ProposalOS] Widget already loaded, skipping duplicate.');
    return;
  }
  window.__ProposalOSWidgetLoaded__ = true;

  // Get configuration from script tag
  const script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  if (!script) {
    console.error('[ProposalOS] Script tag not found.');
    return;
  }

  const config = {
    tenantId: script.getAttribute('data-tenant'),
    primaryColor: script.getAttribute('data-color') || '#6366f1',
    position: script.getAttribute('data-position') || 'bottom-right',
    apiHost: script.src.split('/widget.js')[0],
    language: script.getAttribute('data-lang') || 'en',
  };

  if (!config.tenantId) {
    console.error('[ProposalOS] data-tenant attribute is required.');
    return;
  }

  // Translations
  const i18n = {
    en: {
      title: 'Get Your Free Website Score',
      subtitle: 'See how you stack up against competitors.',
      businessName: 'Business Name',
      websiteUrl: 'Website URL (https://...)',
      analyze: 'Analyze Now',
      loading: 'Analyzing...',
      score: 'Score',
      grade: 'Grade',
      topIssue: 'Top Issue',
      unlockReport: 'Unlock Full Report',
      poweredBy: 'Powered by ProposalOS',
      close: 'Close',
      error: 'Something went wrong. Please try again.',
      required: 'This field is required',
      invalidUrl: 'Please enter a valid URL',
    },
    es: {
      title: 'Obtén la Puntuación Gratuita de Tu Sitio Web',
      subtitle: 'Mira cómo te comparas con la competencia.',
      businessName: 'Nombre del Negocio',
      websiteUrl: 'URL del Sitio Web (https://...)',
      analyze: 'Analizar Ahora',
      loading: 'Analizando...',
      score: 'Puntuación',
      grade: 'Calificación',
      topIssue: 'Problema Principal',
      unlockReport: 'Desbloquear Informe Completo',
      poweredBy: 'Con tecnología de ProposalOS',
      close: 'Cerrar',
      error: 'Algo salió mal. Por favor intenta de nuevo.',
      required: 'Este campo es obligatorio',
      invalidUrl: 'Por favor ingresa una URL válida',
    },
  };

  const t = i18n[config.language] || i18n.en;

  // CSS Styles - Encapsulated in Shadow DOM
  const styles = `
        <style>
            :host {
                all: initial;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            /* Floating Button */
            .widget-button {
                position: fixed;
                ${config.position.includes('right') ? 'right: 20px' : 'left: 20px'};
                bottom: 20px;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: ${config.primaryColor};
                box-shadow: 0 4px 14px rgba(0,0,0,0.25);
                cursor: pointer;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                border: none;
                outline: none;
            }

            .widget-button:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            }

            .widget-button:active {
                transform: scale(0.95);
            }

            .widget-button svg {
                width: 28px;
                height: 28px;
                fill: white;
            }

            /* Modal Container */
            .widget-modal {
                position: fixed;
                ${config.position.includes('right') ? 'right: 20px' : 'left: 20px'};
                bottom: 100px;
                width: 350px;
                max-width: calc(100vw - 40px);
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                color: #1a1a2e;
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
            }

            .widget-modal.open {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }

            /* Modal Header */
            .widget-header {
                background: ${config.primaryColor};
                padding: 20px;
                color: white;
                border-radius: 12px 12px 0 0;
                position: relative;
            }

            .widget-header h3 {
                font-size: 18px;
                font-weight: 700;
                margin: 0 0 5px 0;
                color: white;
            }

            .widget-header p {
                font-size: 13px;
                margin: 0;
                opacity: 0.9;
            }

            .widget-close {
                position: absolute;
                top: 10px;
                right: 15px;
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
                transition: opacity 0.2s;
            }

            .widget-close:hover {
                opacity: 1;
            }

            /* Modal Body */
            .widget-body {
                padding: 20px;
            }

            /* Form */
            .widget-form {
                display: block;
            }

            .widget-form.hidden {
                display: none;
            }

            .widget-input {
                width: 100%;
                padding: 12px;
                margin-bottom: 12px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                font-size: 14px;
                font-family: inherit;
                transition: border-color 0.2s, box-shadow 0.2s;
            }

            .widget-input:focus {
                outline: none;
                border-color: ${config.primaryColor};
                box-shadow: 0 0 0 3px ${config.primaryColor}20;
            }

            .widget-input::placeholder {
                color: #9ca3af;
            }

            .widget-button-submit {
                width: 100%;
                padding: 14px;
                background: ${config.primaryColor};
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                transition: opacity 0.2s, transform 0.2s;
            }

            .widget-button-submit:hover {
                opacity: 0.9;
            }

            .widget-button-submit:active {
                transform: scale(0.98);
            }

            .widget-button-submit:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            /* Results */
            .widget-results {
                display: none;
                text-align: center;
                padding: 10px 0;
            }

            .widget-results.visible {
                display: block;
            }

            .widget-score {
                font-size: 48px;
                font-weight: 800;
                color: ${config.primaryColor};
                line-height: 1;
                margin-bottom: 8px;
            }

            .widget-grade {
                font-weight: 600;
                font-size: 16px;
                margin-bottom: 8px;
            }

            .widget-issue {
                font-size: 12px;
                color: #6b7280;
                margin-bottom: 16px;
            }

            .widget-unlock-btn {
                display: block;
                width: 100%;
                padding: 12px;
                background: #1a1a2e;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                text-align: center;
                transition: opacity 0.2s;
            }

            .widget-unlock-btn:hover {
                opacity: 0.9;
            }

            /* Loading */
            .widget-loading {
                display: none;
                text-align: center;
                padding: 20px;
            }

            .widget-loading.visible {
                display: block;
            }

            .widget-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid #e5e7eb;
                border-top-color: ${config.primaryColor};
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 12px;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .widget-loading-text {
                font-size: 13px;
                color: #6b7280;
            }

            /* Footer */
            .widget-footer {
                background: #f9fafb;
                padding: 12px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
                border-radius: 0 0 12px 12px;
            }

            .widget-footer a {
                color: #9ca3af;
                text-decoration: none;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .widget-footer a:hover {
                color: ${config.primaryColor};
            }

            /* Error State */
            .widget-error {
                background: #fef2f2;
                border: 1px solid #fecaca;
                color: #dc2626;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 12px;
                font-size: 13px;
                display: none;
            }

            .widget-error.visible {
                display: block;
            }

            /* Responsive */
            @media (max-width: 480px) {
                .widget-modal {
                    width: calc(100vw - 20px);
                    bottom: 90px;
                }
                
                .widget-button {
                    width: 50px;
                    height: 50px;
                }
                
                .widget-button svg {
                    width: 24px;
                    height: 24px;
                }
            }
        </style>
    `;

  // Create Shadow DOM Host
  class ProposalWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.isOpen = false;
      this.isSubmitting = false;
    }

    connectedCallback() {
      this.render();
      this.bindEvents();
    }

    render() {
      this.shadowRoot.innerHTML =
        styles +
        `
                <div class="widget-root">
                    <!-- Floating Button -->
                    <button class="widget-button" id="widgetBtn" aria-label="Open website audit widget" aria-expanded="false">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
                        </svg>
                    </button>

                    <!-- Modal -->
                    <div class="widget-modal" id="widgetModal" role="dialog" aria-modal="true" aria-labelledby="widgetTitle">
                        <div class="widget-header">
                            <h3 id="widgetTitle">${t.title}</h3>
                            <p>${t.subtitle}</p>
                            <button class="widget-close" id="closeBtn" aria-label="${t.close}">×</button>
                        </div>
                        
                        <div class="widget-body">
                            <div class="widget-error" id="errorDiv">${t.error}</div>
                            
                            <form class="widget-form" id="widgetForm">
                                <input type="text" class="widget-input" id="businessName" placeholder="${t.businessName}" required aria-required="true">
                                <input type="url" class="widget-input" id="websiteUrl" placeholder="${t.websiteUrl}" required aria-required="true">
                                <button type="submit" class="widget-button-submit" id="submitBtn">${t.analyze}</button>
                            </form>

                            <div class="widget-loading" id="loadingDiv">
                                <div class="widget-spinner"></div>
                                <div class="widget-loading-text">${t.loading}</div>
                            </div>

                            <div class="widget-results" id="resultsDiv">
                                <div class="widget-score" id="scoreDisplay">--</div>
                                <div class="widget-grade" id="gradeDisplay">${t.grade}: --</div>
                                <div class="widget-issue" id="issueDisplay">${t.topIssue}: --</div>
                                <a href="#" class="widget-unlock-btn" id="unlockBtn" target="_blank" rel="noopener noreferrer">${t.unlockReport}</a>
                            </div>
                        </div>

                        <div class="widget-footer">
                            <a href="https://proposalengine.com" target="_blank" rel="noopener noreferrer">${t.poweredBy}</a>
                        </div>
                    </div>
                </div>
            `;
    }

    bindEvents() {
      const btn = this.shadowRoot.getElementById('widgetBtn');
      const modal = this.shadowRoot.getElementById('widgetModal');
      const closeBtn = this.shadowRoot.getElementById('closeBtn');
      const form = this.shadowRoot.getElementById('widgetForm');
      const errorDiv = this.shadowRoot.getElementById('errorDiv');
      const loadingDiv = this.shadowRoot.getElementById('loadingDiv');
      const resultsDiv = this.shadowRoot.getElementById('resultsDiv');

      // Toggle modal
      btn.addEventListener('click', () => this.toggleModal());
      closeBtn.addEventListener('click', () => this.closeModal());

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!this.contains(e.target)) {
          this.closeModal();
        }
      });

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closeModal();
        }
      });

      // Form submission
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    toggleModal() {
      this.isOpen = !this.isOpen;
      const modal = this.shadowRoot.getElementById('widgetModal');
      const btn = this.shadowRoot.getElementById('widgetBtn');

      modal.classList.toggle('open', this.isOpen);
      btn.setAttribute('aria-expanded', String(this.isOpen));

      if (this.isOpen) {
        // Focus first input
        setTimeout(() => {
          this.shadowRoot.getElementById('businessName').focus();
        }, 200);
      }
    }

    closeModal() {
      this.isOpen = false;
      const modal = this.shadowRoot.getElementById('widgetModal');
      const btn = this.shadowRoot.getElementById('widgetBtn');

      modal.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }

    async handleSubmit(e) {
      e.preventDefault();

      if (this.isSubmitting) return;

      const form = this.shadowRoot.getElementById('widgetForm');
      const errorDiv = this.shadowRoot.getElementById('errorDiv');
      const loadingDiv = this.shadowRoot.getElementById('loadingDiv');
      const resultsDiv = this.shadowRoot.getElementById('resultsDiv');
      const submitBtn = this.shadowRoot.getElementById('submitBtn');

      const businessName = this.shadowRoot.getElementById('businessName').value.trim();
      const websiteUrl = this.shadowRoot.getElementById('websiteUrl').value.trim();

      // Validation
      if (!businessName || !websiteUrl) {
        errorDiv.textContent = t.required;
        errorDiv.classList.add('visible');
        return;
      }

      try {
        new URL(websiteUrl);
      } catch {
        errorDiv.textContent = t.invalidUrl;
        errorDiv.classList.add('visible');
        return;
      }

      // Submit
      this.isSubmitting = true;
      errorDiv.classList.remove('visible');
      form.classList.add('hidden');
      loadingDiv.classList.add('visible');
      submitBtn.disabled = true;

      try {
        const response = await fetch(`${config.apiHost}/api/widget/quick-audit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Origin': window.location.origin,
          },
          body: JSON.stringify({
            businessName,
            websiteUrl,
            tenantId: config.tenantId,
            source: window.location.href,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        loadingDiv.classList.remove('visible');
        resultsDiv.classList.add('visible');

        this.shadowRoot.getElementById('scoreDisplay').textContent = data.score || '--';
        this.shadowRoot.getElementById('gradeDisplay').textContent =
          `${t.grade}: ${data.grade || '--'}`;
        this.shadowRoot.getElementById('issueDisplay').textContent =
          `${t.topIssue}: ${data.topIssue || '--'}`;

        const unlockBtn = this.shadowRoot.getElementById('unlockBtn');
        if (data.token) {
          unlockBtn.href = `${config.apiHost}/report/${data.token}`;
        } else {
          unlockBtn.href = `${config.apiHost}/free-audit?url=${encodeURIComponent(websiteUrl)}&name=${encodeURIComponent(businessName)}`;
        }
      } catch (error) {
        console.error('[ProposalOS] Error:', error);
        loadingDiv.classList.remove('visible');
        form.classList.remove('hidden');
        errorDiv.textContent = t.error;
        errorDiv.classList.add('visible');
      } finally {
        this.isSubmitting = false;
        submitBtn.disabled = false;
      }
    }
  }

  // Register Web Component
  if (!customElements.get('proposal-widget')) {
    customElements.define('proposal-widget', ProposalWidget);
  }

  // Inject widget into page
  const widget = document.createElement('proposal-widget');
  document.body.appendChild(widget);

  console.log('[ProposalOS] Widget loaded successfully with Shadow DOM isolation.');
})();
