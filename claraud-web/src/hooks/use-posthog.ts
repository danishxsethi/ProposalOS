"use client";
import posthog from 'posthog-js';

export function usePostHog() {
  const captureEvent = (eventName: string, properties?: Record<string, any>) => {
    posthog.capture(eventName, properties);
  };
  return { captureEvent };
}