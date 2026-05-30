'use client';

import * as React from 'react';

/**
 * Focus Trap Hook — WCAG AA Compliant
 * Traps focus within a container for accessible modals/dialogs
 * 
 * Features:
 * - Traps Tab/Shift+Tab within container
 * - Handles Escape key to close
 * - Restores focus to trigger element on unmount
 * - Supports nested focusable elements
 */
export function useFocusTrap(
  isActive: boolean,
  onClose?: () => void
): React.RefObject<HTMLDivElement | null> {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!isActive) return;

    // Store the currently focused element to restore later
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in the container
    const container = containerRef.current;
    if (container) {
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length > 0) {
        // Small delay to ensure container is rendered
        setTimeout(() => {
          focusableElements[0].focus();
        }, 0);
      }
    }

    // Handle keyboard navigation
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!container) return;

      // Handle Escape key
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }

      // Handle Tab key for focus trapping
      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements(container);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        // Shift + Tab
        if (event.shiftKey) {
          if (activeElement === firstElement || !container.contains(activeElement as Node)) {
            event.preventDefault();
            lastElement.focus();
          }
        }
        // Tab
        else {
          if (activeElement === lastElement || !container.contains(activeElement as Node)) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previous element
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, onClose]);

  // Prevent body scroll when trap is active
  React.useEffect(() => {
    if (!isActive) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Get all focusable elements within a container
 * Follows WAI-ARIA best practices for focusable elements
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
    'audio[controls]',
    'video[controls]',
    'details>summary:first-of-type',
    'iframe',
  ].join(', ');

  const elements = Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));

  // Filter out elements that are not visible
  return elements.filter((el) => {
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      el.offsetParent !== null
    );
  });
}

/**
 * Hook to manage focus visibility for keyboard users
 * Adds 'focus-visible' class only when navigating with keyboard
 */
export function useFocusVisible() {
  React.useEffect(() => {
    let hadKeyboardEvent = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        hadKeyboardEvent = true;
      }
    };

    const handleKeyUp = () => {
      hadKeyboardEvent = false;
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (hadKeyboardEvent) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousedown', handleMouseDown, true);

    // Add class to body when keyboard navigation detected
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (hadKeyboardEvent && target) {
        target.classList.add('focus-visible');
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (target) {
        target.classList.remove('focus-visible');
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);
}