/**
 * Wave 7B — P2-42: conversion CTA detection counted any element whose text matched
 * the CTA pattern, regardless of whether it was actually rendered. Green-after:
 * `analyzePage`'s CTA loop gates on real rendered visibility (display, visibility,
 * opacity, non-zero bounding box, disabled state, collapsed-ancestor offsetParent)
 * before counting an element as a CTA or as "above the fold".
 *
 * Runs under jsdom so the exact production function (passed by reference to
 * Puppeteer's `page.evaluate(analyzePage)` in `runConversionModule`) executes
 * against a real DOM — no browser mock stands in for the module under test.
 *
 * jsdom does not perform real layout, so every element's native
 * `getBoundingClientRect()` is zero-size and `offsetParent` is always `null`.
 * Each test stubs only the single geometry signal it is proving, and gives every
 * other CTA candidate a normal rendered geometry — so a failing assertion means
 * the production visibility gate itself is wrong, not a jsdom layout artifact.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { analyzePage } from '../conversion';

function mount(html: string) {
  document.body.innerHTML = html;
}

/** Simulate a normally-rendered, on-screen element. */
function stubRendered(el: Element) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      width: 100,
      height: 40,
      top: 10,
      left: 10,
      bottom: 50,
      right: 110,
      x: 10,
      y: 10,
      toJSON() {
        return {};
      },
    }),
    configurable: true,
  });
  Object.defineProperty(el, 'offsetParent', {
    get: () => document.body,
    configurable: true,
  });
}

/** Simulate an element collapsed by a display:none ancestor (offsetParent null). */
function stubCollapsedByAncestor(el: Element) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      width: 100,
      height: 40,
      top: 10,
      left: 10,
      bottom: 50,
      right: 110,
      x: 10,
      y: 10,
      toJSON() {
        return {};
      },
    }),
    configurable: true,
  });
  Object.defineProperty(el, 'offsetParent', {
    get: () => null,
    configurable: true,
  });
}

describe('conversion analyzePage CTA visibility gate (P2-42)', () => {
  it('counts a normal visible CTA button', () => {
    mount('<button id="cta">Book Now</button>');
    stubRendered(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(1);
  });

  it('does not count a display:none CTA', () => {
    mount('<button id="cta" style="display:none">Book Now</button>');
    stubRendered(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(0);
  });

  it('does not count a visibility:hidden CTA', () => {
    mount('<button id="cta" style="visibility:hidden">Get Quote</button>');
    stubRendered(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(0);
  });

  it('does not count a fully transparent (opacity:0) CTA', () => {
    mount('<a href="#" id="cta" style="opacity:0">Schedule</a>');
    stubRendered(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(0);
  });

  it('does not count a disabled CTA button', () => {
    mount('<button id="cta" disabled>Book Now</button>');
    stubRendered(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(0);
  });

  it('does not count a zero-size CTA', () => {
    mount('<button id="cta">Book Now</button>');
    // Leave native jsdom geometry (zero-size) — no stub applied.
    const result = analyzePage();
    expect(result.ctas.count).toBe(0);
  });

  it('does not count a CTA collapsed by a display:none ancestor', () => {
    mount('<div style="display:none"><button id="cta">Call Now</button></div>');
    stubCollapsedByAncestor(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(0);
  });

  it('does not double-count a hidden duplicate alongside one visible CTA', () => {
    mount(
      '<button id="visible-cta">Book Now</button>' +
        '<div style="display:none"><button id="hidden-cta">Book Now</button></div>'
    );
    stubRendered(document.getElementById('visible-cta')!);
    stubCollapsedByAncestor(document.getElementById('hidden-cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(1);
  });

  it('counts a real navigation-adjacent link as a CTA when it is genuinely rendered', () => {
    // P2-42 only adds a visibility gate; it intentionally does not attempt CTA
    // vs. nav-link disambiguation (out of Wave 7B scope) — a rendered link
    // matching the CTA text pattern is still counted.
    mount('<a href="/book" id="cta">Book Now</a>');
    stubRendered(document.getElementById('cta')!);
    const result = analyzePage();
    expect(result.ctas.count).toBe(1);
  });
});
