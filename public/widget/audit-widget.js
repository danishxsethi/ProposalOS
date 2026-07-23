/**
 * Embeddable Audit Widget — ProposalEngine
 * Loads asynchronously without blocking the host site.
 * Provides init(config), on(event, callback), and destroy() API.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 10.7
 */
(function () {
  'use strict';

  // Prevent double-init
  if (window.ProposalEngineWidget && window.ProposalEngineWidget._initialized) return;

  // ── Event emitter ────────────────────────────────────────────────────────
  var listeners = {};

  function emit(event, data) {
    var cbs = listeners[event] || [];
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](data); } catch (e) { console.error('[PE Widget] callback error', e); }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  var API_BASE = '';
  var config = null;
  var containerEl = null;
  var sessionId = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  function resolveApiBase() {
    // Use the script src origin, or fall back to current origin
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('audit-widget') !== -1) {
        var url = new URL(scripts[i].src);
        return url.origin;
      }
    }
    return window.location.origin;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.keys(attrs[k]).forEach(function (s) { node.style[s] = attrs[k][s]; });
        } else if (k.indexOf('on') === 0) {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      if (typeof children === 'string') { node.textContent = children; }
      else if (Array.isArray(children)) {
        children.forEach(function (c) { if (c) node.appendChild(c); });
      }
    }
    return node;
  }

  // ── Styles ─────────────────────────────────────────────────────────────
  function injectStyles(primaryColor) {
    var styleId = 'pe-widget-styles';
    if (document.getElementById(styleId)) return;
    var css = [
      '.pe-widget { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 480px; margin: 0 auto; }',
      '.pe-widget * { box-sizing: border-box; }',
      '.pe-widget-form { display: flex; flex-direction: column; gap: 10px; }',
      '.pe-widget-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; outline: none; }',
      '.pe-widget-input:focus { border-color: ' + (primaryColor || '#6366f1') + '; box-shadow: 0 0 0 2px ' + (primaryColor || '#6366f1') + '33; }',
      '.pe-widget-btn { width: 100%; padding: 12px; border: none; border-radius: 6px; font-size: 15px; font-weight: 600; color: #fff; cursor: pointer; transition: opacity 0.2s; }',
      '.pe-widget-btn:hover { opacity: 0.9; }',
      '.pe-widget-btn:disabled { opacity: 0.6; cursor: not-allowed; }',
      '.pe-widget-results { padding: 16px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; margin-top: 12px; }',
      '.pe-widget-score { font-size: 36px; font-weight: 700; text-align: center; margin: 8px 0; }',
      '.pe-widget-grade { font-size: 14px; text-align: center; color: #6b7280; }',
      '.pe-widget-issue { font-size: 13px; color: #374151; margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 4px; }',
      '.pe-widget-contact { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }',
      '.pe-widget-error { color: #dc2626; font-size: 13px; margin-top: 8px; }',
      '.pe-widget-loading { text-align: center; padding: 20px; color: #6b7280; }',
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ── Render form ────────────────────────────────────────────────────────
  function renderForm() {
    containerEl.innerHTML = '';
    var wrapper = el('div', { class: 'pe-widget' });
    var form = el('div', { class: 'pe-widget-form' });

    // URL input (always present)
    var urlInput = el('input', {
      class: 'pe-widget-input',
      type: 'url',
      placeholder: 'Enter your website URL',
      'aria-label': 'Website URL',
      required: 'true',
    });
    form.appendChild(urlInput);

    // Submit button
    var btnColor = (config.theme && config.theme.primaryColor) || '#6366f1';
    var btnText = (config.theme && config.theme.buttonText) || 'Get Free Audit';
    var submitBtn = el('button', {
      class: 'pe-widget-btn',
      style: { backgroundColor: btnColor },
      type: 'button',
    }, btnText);

    var errorDiv = el('div', { class: 'pe-widget-error', style: { display: 'none' } });

    submitBtn.addEventListener('click', function () {
      var url = urlInput.value.trim();
      if (!url) {
        errorDiv.textContent = 'Please enter a website URL.';
        errorDiv.style.display = 'block';
        return;
      }
      errorDiv.style.display = 'none';
      handleSubmit(url);
    });

    form.appendChild(submitBtn);
    form.appendChild(errorDiv);
    wrapper.appendChild(form);
    containerEl.appendChild(wrapper);
  }

  // ── Submit handler ─────────────────────────────────────────────────────
  function handleSubmit(url) {
    emit('submit', { url: url, sessionId: sessionId });
    showLoading();

    var payload = {
      tenantId: config.tenantId,
      url: url,
      sessionId: sessionId,
      referrerUrl: document.referrer || window.location.href,
    };

    fetch(API_BASE + '/api/widget/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        var captureFirst = config.behavior && config.behavior.captureBeforeResults;
        if (captureFirst) {
          showContactCapture(data);
        } else {
          showResults(data);
        }
      })
      .catch(function (err) {
        emit('error', { message: err.message });
        showError(err.message || 'Something went wrong. Please try again.');
      });
  }

  function showLoading() {
    containerEl.innerHTML = '';
    var wrapper = el('div', { class: 'pe-widget' });
    wrapper.appendChild(el('div', { class: 'pe-widget-loading' }, 'Analyzing your website…'));
    containerEl.appendChild(wrapper);
  }

  function showError(msg) {
    containerEl.innerHTML = '';
    var wrapper = el('div', { class: 'pe-widget' });
    wrapper.appendChild(el('div', { class: 'pe-widget-error', style: { display: 'block' } }, msg));
    var retryBtn = el('button', {
      class: 'pe-widget-btn',
      style: { backgroundColor: (config.theme && config.theme.primaryColor) || '#6366f1', marginTop: '10px' },
    }, 'Try Again');
    retryBtn.addEventListener('click', renderForm);
    wrapper.appendChild(retryBtn);
    containerEl.appendChild(wrapper);
  }

  // ── Contact capture (shown before full results) ────────────────────────
  function showContactCapture(auditData) {
    containerEl.innerHTML = '';
    var wrapper = el('div', { class: 'pe-widget' });

    // Teaser
    var teaser = el('div', { class: 'pe-widget-results' });
    teaser.appendChild(el('div', { class: 'pe-widget-grade' }, 'Your website scored'));
    teaser.appendChild(el('div', { class: 'pe-widget-score' }, String(auditData.score || '--')));
    teaser.appendChild(el('div', { class: 'pe-widget-grade' }, 'Grade: ' + (auditData.grade || 'N/A')));
    wrapper.appendChild(teaser);

    // Contact form
    var contactForm = el('div', { class: 'pe-widget-contact' });
    var fields = (config.theme && config.theme.formFields) || ['email'];
    var inputs = {};

    fields.forEach(function (field) {
      var placeholder = field === 'email' ? 'Email address' : field === 'phone' ? 'Phone number' : 'Your name';
      var type = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
      var inp = el('input', {
        class: 'pe-widget-input',
        type: type,
        placeholder: placeholder,
        'aria-label': placeholder,
      });
      inputs[field] = inp;
      contactForm.appendChild(inp);
    });

    var btnColor = (config.theme && config.theme.primaryColor) || '#6366f1';
    var unlockBtn = el('button', {
      class: 'pe-widget-btn',
      style: { backgroundColor: btnColor },
    }, 'See Full Results');

    var errorDiv = el('div', { class: 'pe-widget-error', style: { display: 'none' } });

    unlockBtn.addEventListener('click', function () {
      // Validate at least email
      var contactData = {};
      Object.keys(inputs).forEach(function (k) { contactData[k] = inputs[k].value.trim(); });

      if (fields.indexOf('email') !== -1 && !contactData.email) {
        errorDiv.textContent = 'Please enter your email address.';
        errorDiv.style.display = 'block';
        return;
      }
      errorDiv.style.display = 'none';
      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Loading…';

      // Send contact info to create lead
      fetch(API_BASE + '/api/widget/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: config.tenantId,
          url: auditData.url || '',
          sessionId: sessionId,
          email: contactData.email || undefined,
          phone: contactData.phone || undefined,
          name: contactData.name || undefined,
          auditId: auditData.auditId,
          referrerUrl: document.referrer || window.location.href,
        }),
      })
        .then(function (res) { return res.json(); })
        .then(function () {
          showResults(auditData);
        })
        .catch(function (err) {
          emit('error', { message: err.message });
          errorDiv.textContent = 'Something went wrong. Please try again.';
          errorDiv.style.display = 'block';
          unlockBtn.disabled = false;
          unlockBtn.textContent = 'See Full Results';
        });
    });

    contactForm.appendChild(unlockBtn);
    contactForm.appendChild(errorDiv);
    wrapper.appendChild(contactForm);
    containerEl.appendChild(wrapper);
  }

  // ── Results display ────────────────────────────────────────────────────
  function showResults(data) {
    containerEl.innerHTML = '';
    var wrapper = el('div', { class: 'pe-widget' });
    var results = el('div', { class: 'pe-widget-results' });

    results.appendChild(el('div', { class: 'pe-widget-grade' }, 'Website Audit Results'));
    results.appendChild(el('div', { class: 'pe-widget-score' }, String(data.score || '--')));
    results.appendChild(el('div', { class: 'pe-widget-grade' }, 'Grade: ' + (data.grade || 'N/A')));

    if (data.topIssue) {
      results.appendChild(el('div', { class: 'pe-widget-issue' }, '⚠ ' + data.topIssue));
    }

    wrapper.appendChild(results);

    // Redirect if configured
    if (config.behavior && config.behavior.redirectUrl) {
      var link = el('a', {
        href: config.behavior.redirectUrl,
        style: { display: 'block', textAlign: 'center', marginTop: '12px', color: (config.theme && config.theme.primaryColor) || '#6366f1' },
      }, 'View Full Report →');
      wrapper.appendChild(link);
    }

    containerEl.appendChild(wrapper);
    emit('complete', data);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  window.ProposalEngineWidget = {
    _initialized: false,

    init: function (cfg) {
      if (!cfg || !cfg.tenantId) {
        console.error('[PE Widget] tenantId is required');
        return;
      }
      config = cfg;
      API_BASE = resolveApiBase();

      var containerId = cfg.containerId || 'pe-audit-widget';
      containerEl = document.getElementById(containerId);
      if (!containerEl) {
        console.error('[PE Widget] Container element #' + containerId + ' not found');
        return;
      }

      injectStyles(cfg.theme && cfg.theme.primaryColor);
      renderForm();
      this._initialized = true;

      // Track impression
      fetch(API_BASE + '/api/widget/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: cfg.tenantId,
          sessionId: sessionId,
          type: 'impression',
          referrerUrl: document.referrer || window.location.href,
        }),
      }).catch(function () { /* silent */ });
    },

    on: function (event, callback) {
      if (typeof callback !== 'function') return;
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },

    destroy: function () {
      if (containerEl) containerEl.innerHTML = '';
      listeners = {};
      config = null;
      this._initialized = false;
    },
  };
})();
