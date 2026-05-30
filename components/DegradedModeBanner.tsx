'use client';

/**
 * Degraded Mode Banner Component
 *
 * Displays a banner when the platform is running in degraded mode due to:
 * - LLM provider outage (Gemini down)
 * - Email provider issues
 * - Other critical service failures
 *
 * The banner is shown to admins/operators to indicate reduced functionality.
 */

import { useEffect, useState } from 'react';

export interface DegradedService {
  name: string;
  status: 'degraded' | 'down';
  fallback: string;
  since?: Date;
}

export function DegradedModeBanner() {
  const [degradedServices, setDegradedServices] = useState<DegradedService[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check for degraded mode status from localStorage
    // This is set by the circuit breaker when it opens
    const checkDegradedMode = () => {
      try {
        const degradedModeData = localStorage.getItem('degradedMode');
        if (degradedModeData) {
          const services = JSON.parse(degradedModeData) as DegradedService[];
          if (services.length > 0) {
            setDegradedServices(services);
            setIsVisible(true);
          }
        }
      } catch (error) {
        console.error('Failed to parse degraded mode data:', error);
      }
    };

    checkDegradedMode();

    // Poll for updates every 30 seconds
    const interval = setInterval(checkDegradedMode, 30000);

    return () => clearInterval(interval);
  }, []);

  const dismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible || degradedServices.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center space-x-3">
            <svg
              className="h-5 w-5 text-amber-600"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">
                {(() => {
                  const firstService = degradedServices[0];
                  return degradedServices.length === 1 && firstService
                    ? `${firstService.name} is ${firstService.status}`
                    : `${degradedServices.length} services experiencing issues`;
                })()}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {degradedServices.map((service) => service.fallback).join(' • ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex-shrink-0 p-1.5 rounded-md text-amber-600 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            onClick={dismiss}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to update degraded mode status
 */
export function useDegradedMode() {
  const setDegradedMode = (services: DegradedService[]) => {
    try {
      if (services.length > 0) {
        localStorage.setItem('degradedMode', JSON.stringify(services));
      } else {
        localStorage.removeItem('degradedMode');
      }
    } catch (error) {
      console.error('Failed to set degraded mode:', error);
    }
  };

  const clearDegradedMode = () => {
    try {
      localStorage.removeItem('degradedMode');
    } catch (error) {
      console.error('Failed to clear degraded mode:', error);
    }
  };

  return { setDegradedMode, clearDegradedMode };
}

/**
 * Server-side function to check if a service is degraded
 * Can be used in API routes and server components
 */
export async function isServiceDegraded(serviceName: string): Promise<boolean> {
  // In a real implementation, this would check a Redis cache or database
  // For now, we'll just return false as the client-side check handles it
  return false;
}

/**
 * Server-side function to set degraded mode status
 * Called by circuit breaker when it opens
 */
export async function setServiceDegraded(
  serviceName: string,
  status: 'degraded' | 'down',
  fallback: string
): Promise<void> {
  // This would typically update a Redis cache or database
  // The client polls this status and updates localStorage
  console.log(`Service degraded: ${serviceName} - ${status} - Fallback: ${fallback}`);
}

export default DegradedModeBanner;
