import { Finding } from '@prisma/client';
import { RawArtifact, ArtifactGenerator } from './schemaGenerator';

/**
 * Accessibility Generator - Generates ARIA label additions, alt text strings, and color contrast CSS fixes
 */
export class AccessibilityGenerator implements ArtifactGenerator {
  async generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact> {
    const accessibilityType = this.determineAccessibilityType(finding);
    const content = this.generateAccessibilityFix(accessibilityType, finding, proposalContext);

    return {
      content,
      artifactType: 'aria_fix',
      metadata: {
        findingId: finding.id,
        generatedAt: new Date(),
        category: finding.category,
      },
    };
  }

  getArtifactType(): string {
    return 'aria_fix';
  }

  supportsWordPress(): boolean {
    return true;
  }

  async generateWordPressPlugin(finding: Finding, artifact: RawArtifact): Promise<string> {
    return `<?php
/**
 * Plugin Name: Accessibility - ${finding.title}
 * Description: Auto-generated accessibility fixes for ${finding.title}
 * Version: 1.0.0
 */

add_filter('wp_kses_allowed_html', function(\$allowed, \$context) {
    if (\$context === 'post') {
        \$allowed['img']['alt'] = true;
        \$allowed['img']['aria-label'] = true;
        \$allowed['button']['aria-label'] = true;
        \$allowed['a']['aria-label'] = true;
    }
    return \$allowed;
});

add_action('wp_footer', function() {
    ?>
    <style>
    ${artifact.content.split('\\n').filter(line => line.includes('{')).join('\\n')}
    </style>
    <?php
});
?>`;
  }

  private determineAccessibilityType(finding: Finding): string {
    const description = (finding.description || '').toLowerCase();

    if (description.includes('aria') || description.includes('label')) {
      return 'aria_labels';
    }
    if (description.includes('alt') || description.includes('image')) {
      return 'alt_text';
    }
    if (description.includes('contrast') || description.includes('color')) {
      return 'color_contrast';
    }
    if (description.includes('keyboard') || description.includes('focus')) {
      return 'keyboard_navigation';
    }
    return 'aria_labels';
  }

  private generateAccessibilityFix(type: string, finding: Finding, context: Record<string, any>): string {
    switch (type) {
      case 'aria_labels':
        return this.generateAriaLabels(finding, context);
      case 'alt_text':
        return this.generateAltText(finding, context);
      case 'color_contrast':
        return this.generateColorContrast(finding, context);
      case 'keyboard_navigation':
        return this.generateKeyboardNavigation(finding, context);
      default:
        return this.generateAriaLabels(finding, context);
    }
  }

  private generateAriaLabels(finding: Finding, context: Record<string, any>): string {
    return `
# ARIA Labels Implementation

## HTML Examples

### Navigation Menu
\`\`\`html
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/services">Services</a></li>
    <li><a href="/about">About</a></li>
    <li><a href="/contact">Contact</a></li>
  </ul>
</nav>
\`\`\`

### Search Form
\`\`\`html
<form aria-label="Search">
  <input type="search" aria-label="Search products" placeholder="Search...">
  <button type="submit" aria-label="Submit search">Search</button>
</form>
\`\`\`

### Modal Dialog
\`\`\`html
<div role="dialog" aria-labelledby="dialog-title" aria-modal="true">
  <h2 id="dialog-title">Confirm Action</h2>
  <p>Are you sure you want to proceed?</p>
  <button>Cancel</button>
  <button>Confirm</button>
</div>
\`\`\`

### Icon Buttons
\`\`\`html
<button aria-label="Close menu">
  <svg><!-- close icon --></svg>
</button>

<button aria-label="Open menu">
  <svg><!-- menu icon --></svg>
</button>
\`\`\`

### Expandable Sections
\`\`\`html
<button aria-expanded="false" aria-controls="section-1">
  More Information
</button>
<div id="section-1" hidden>
  Additional content here
</div>
\`\`\`

## CSS for Accessibility
\`\`\`css
/* Focus visible for keyboard navigation */
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid #4A90E2;
  outline-offset: 2px;
}

/* Skip to main content link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: white;
  padding: 8px;
  text-decoration: none;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
\`\`\`
`.trim();
  }

  private generateAltText(finding: Finding, context: Record<string, any>): string {
    return `
# Alt Text Implementation Guide

## Best Practices for Alt Text

### Descriptive Alt Text Examples

#### Product Images
\`\`\`html
<!-- Good -->
<img src="blue-running-shoes.jpg" alt="Blue Nike running shoes with white sole">

<!-- Avoid -->
<img src="blue-running-shoes.jpg" alt="image">
<img src="blue-running-shoes.jpg" alt="product">
\`\`\`

#### Logo Images
\`\`\`html
<!-- Good -->
<img src="logo.png" alt="Company Name - Home">

<!-- Avoid -->
<img src="logo.png" alt="logo">
\`\`\`

#### Decorative Images
\`\`\`html
<!-- Good - empty alt for decorative images -->
<img src="decorative-line.png" alt="">

<!-- Or use aria-hidden -->
<img src="decorative-line.png" alt="" aria-hidden="true">
\`\`\`

#### Infographics
\`\`\`html
<!-- Good -->
<img src="sales-chart.png" alt="Sales increased 25% in Q3 2024">

<!-- Or provide detailed description -->
<img src="sales-chart.png" alt="Sales chart">
<p>Sales increased 25% in Q3 2024, with highest growth in the West region.</p>
\`\`\`

## Alt Text Length Guidelines
- Keep alt text under 125 characters
- Be descriptive but concise
- Include relevant context
- Don't start with "image of" or "picture of"

## CSS for Missing Alt Text Detection
\`\`\`css
/* Highlight images without alt text (for development) */
img:not([alt]),
img[alt=""] {
  border: 2px solid red;
}
\`\`\`
`.trim();
  }

  private generateColorContrast(finding: Finding, context: Record<string, any>): string {
    return `
# Color Contrast CSS Fixes

## WCAG AA Compliance (4.5:1 for text, 3:1 for graphics)

### Text Color Contrast Examples

\`\`\`css
/* Good contrast - Dark text on light background */
body {
  background-color: #FFFFFF;
  color: #000000;
  /* Contrast ratio: 21:1 */
}

/* Good contrast - Light text on dark background */
.dark-section {
  background-color: #1A1A1A;
  color: #FFFFFF;
  /* Contrast ratio: 19.56:1 */
}

/* Good contrast - Blue text on white */
a {
  color: #0066CC;
  background-color: #FFFFFF;
  /* Contrast ratio: 8.59:1 */
}

/* Improved contrast for buttons */
.button {
  background-color: #0066CC;
  color: #FFFFFF;
  /* Contrast ratio: 8.59:1 */
}

.button:hover {
  background-color: #0052A3;
  color: #FFFFFF;
  /* Contrast ratio: 10.89:1 */
}

/* Form inputs */
input,
textarea,
select {
  background-color: #FFFFFF;
  color: #000000;
  border: 2px solid #0066CC;
  /* Contrast ratio: 21:1 */
}

input:focus {
  border-color: #0052A3;
  outline: 2px solid #0052A3;
}

/* Placeholder text */
::placeholder {
  color: #666666;
  /* Contrast ratio: 7:1 */
}

/* Disabled state */
:disabled {
  color: #999999;
  background-color: #F5F5F5;
  /* Contrast ratio: 4.54:1 */
}
\`\`\`

## Testing Tools
- WebAIM Contrast Checker
- Axe DevTools
- WAVE Browser Extension
- Lighthouse (Chrome DevTools)

## Common Issues and Fixes

### Issue: Light gray text on white background
\`\`\`css
/* Before - Poor contrast */
.text {
  color: #CCCCCC;
  background-color: #FFFFFF;
}

/* After - Good contrast */
.text {
  color: #666666;
  background-color: #FFFFFF;
}
\`\`\`

### Issue: Dark text on dark background
\`\`\`css
/* Before - No contrast */
.text {
  color: #333333;
  background-color: #000000;
}

/* After - Good contrast */
.text {
  color: #FFFFFF;
  background-color: #000000;
}
\`\`\`
`.trim();
  }

  private generateKeyboardNavigation(finding: Finding, context: Record<string, any>): string {
    return `
# Keyboard Navigation Implementation

## Focus Management

\`\`\`css
/* Visible focus indicator */
:focus-visible {
  outline: 3px solid #4A90E2;
  outline-offset: 2px;
}

/* Remove default outline for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}

/* Tab order */
button,
a,
input,
select,
textarea {
  outline: 2px solid transparent;
  outline-offset: 2px;
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid #4A90E2;
}
\`\`\`

## HTML Implementation

\`\`\`html
<!-- Skip to main content link -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<!-- Proper heading hierarchy -->
<h1>Page Title</h1>
<h2>Section Title</h2>
<h3>Subsection Title</h3>

<!-- Keyboard accessible menu -->
<nav>
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/services">Services</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>

<!-- Accessible form -->
<form>
  <label for="name">Name:</label>
  <input type="text" id="name" name="name" required>
  
  <label for="email">Email:</label>
  <input type="email" id="email" name="email" required>
  
  <button type="submit">Submit</button>
</form>
\`\`\`

## JavaScript for Enhanced Keyboard Support

\`\`\`javascript
// Trap focus in modal
function trapFocus(modal) {
  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  });
}
\`\`\`
`.trim();
  }
}
