/**
 * Cookie Consent Banner
 * 
 * GDPR-compliant cookie consent management component.
 * Allows users to accept/reject non-essential cookies.
 */

'use client';

import { useEffect, useState } from 'react';

export interface CookiePreferences {
  essential: boolean; // Always true, cannot be disabled
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
};

const COOKIE_CONSENT_KEY = 'cookie_consent_preferences';
const COOKIE_CONSENT_EXPIRY_DAYS = 365;

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    
    if (!stored) {
      // Show banner after a short delay
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }

    // Load stored preferences
    try {
      const parsed = JSON.parse(stored);
      setPreferences(parsed);
      
      // Apply preferences
      applyCookiePreferences(parsed);
    } catch {
      // Invalid stored preferences, show banner
      setIsVisible(true);
    }
  }, []);

  const applyCookiePreferences = (prefs: CookiePreferences) => {
    // Signal to analytics scripts which cookies are allowed
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookie-consent', { detail: prefs }));
      
      // Set cookies based on preferences
      if (prefs.analytics) {
        // Enable analytics (PostHog, Google Analytics, etc.)
        console.log('[Cookie Consent] Analytics enabled');
      }
      
      if (prefs.marketing) {
        // Enable marketing cookies
        console.log('[Cookie Consent] Marketing enabled');
      }
      
      if (prefs.functional) {
        // Enable functional cookies
        console.log('[Cookie Consent] Functional enabled');
      }
    }
  };

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    
    savePreferences(allAccepted);
    setIsVisible(false);
  };

  const handleRejectAll = () => {
    const allRejected: CookiePreferences = {
      essential: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    
    savePreferences(allRejected);
    setIsVisible(false);
  };

  const handleSavePreferences = () => {
    savePreferences(preferences);
    setIsVisible(false);
  };

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs));
    
    // Set expiry cookie
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + COOKIE_CONSENT_EXPIRY_DAYS);
    document.cookie = `${COOKIE_CONSENT_KEY}=accepted; expires=${expiryDate.toUTCString()}; path=/`;
    
    applyCookiePreferences(prefs);
  };

  const togglePreference = (key: keyof Omit<CookiePreferences, 'essential'>) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
      {/* Main Banner */}
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              We use cookies
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              We use cookies to enhance your browsing experience, analyze site traffic, 
              and personalize content. By clicking "Accept All", you consent to our use of cookies.
            </p>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-500 font-medium"
            >
              {isExpanded ? 'Show less' : 'Customize preferences'}
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
            <button
              onClick={handleRejectAll}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Reject All
            </button>
            <button
              onClick={handleAcceptAll}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Accept All
            </button>
          </div>
        </div>

        {/* Expanded Preferences */}
        {isExpanded && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">
              Cookie Preferences
            </h4>
            
            <div className="space-y-4">
              {/* Essential Cookies */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Essential</span>
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                      Required
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Required for basic site functionality. Cannot be disabled.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-green-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 opacity-50"></div>
                </label>
              </div>

              {/* Functional Cookies */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Functional</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Enable enhanced features and personalization.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.functional}
                    onChange={() => togglePreference('functional')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Analytics Cookies */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Analytics</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Help us improve by collecting anonymous usage data.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={() => togglePreference('analytics')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Marketing Cookies */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Marketing</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Used for personalized advertising and retargeting.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={() => togglePreference('marketing')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSavePreferences}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CookieConsent;