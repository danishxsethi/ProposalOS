import { Finding } from '@prisma/client';
import { RawArtifact, ArtifactGenerator } from './schemaGenerator';

/**
 * Speed Generator - Generates optimization scripts for image compression, lazy loading, CSS minification
 */
export class SpeedGenerator implements ArtifactGenerator {
  async generate(finding: Finding, proposalContext: Record<string, any>): Promise<RawArtifact> {
    const optimizationType = this.determineOptimizationType(finding);
    const content = this.generateOptimizationScript(optimizationType, finding, proposalContext);

    return {
      content,
      artifactType: 'speed_script',
      metadata: {
        findingId: finding.id,
        generatedAt: new Date(),
        category: finding.category,
      },
    };
  }

  getArtifactType(): string {
    return 'speed_script';
  }

  supportsWordPress(): boolean {
    return true;
  }

  async generateWordPressPlugin(finding: Finding, artifact: RawArtifact): Promise<string> {
    return `<?php
/**
 * Plugin Name: Performance Optimization - ${finding.title}
 * Description: Auto-generated performance optimization for ${finding.title}
 * Version: 1.0.0
 */

add_action('wp_footer', function() {
    ?>
    <script>
    ${artifact.content}
    </script>
    <?php
});
?>`;
  }

  private determineOptimizationType(finding: Finding): string {
    const description = (finding.description || '').toLowerCase();

    if (description.includes('image') || description.includes('compression')) {
      return 'image_compression';
    }
    if (description.includes('lazy') || description.includes('load')) {
      return 'lazy_loading';
    }
    if (description.includes('css') || description.includes('minif')) {
      return 'css_minification';
    }
    return 'general_optimization';
  }

  private generateOptimizationScript(type: string, finding: Finding, context: Record<string, any>): string {
    switch (type) {
      case 'image_compression':
        return this.generateImageCompressionScript();
      case 'lazy_loading':
        return this.generateLazyLoadingScript();
      case 'css_minification':
        return this.generateCssMinificationScript();
      default:
        return this.generateGeneralOptimizationScript();
    }
  }

  private generateImageCompressionScript(): string {
    return `
// Image Compression Optimization
(function() {
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    // Add loading="lazy" for native lazy loading
    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }
    
    // Add decoding="async" for async decoding
    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
    }
    
    // Optimize image sizes
    if (img.width > 1200) {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    }
  });
  
  // Use WebP format if supported
  if (document.createElement('canvas').toDataURL('image/webp').indexOf('image/webp') === 0) {
    document.documentElement.classList.add('webp-support');
  }
})();
`.trim();
  }

  private generateLazyLoadingScript(): string {
    return `
// Lazy Loading Optimization
(function() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          img.classList.add('loaded');
          observer.unobserve(img);
        }
      });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  } else {
    // Fallback for older browsers
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
    });
  }
})();
`.trim();
  }

  private generateCssMinificationScript(): string {
    return `
// CSS Minification and Optimization
(function() {
  // Remove unused CSS by analyzing DOM
  const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
  
  // Defer non-critical CSS
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    if (!link.hasAttribute('media') || link.getAttribute('media') === 'all') {
      // Load CSS asynchronously
      const newLink = link.cloneNode(true);
      newLink.media = 'print';
      newLink.onload = function() {
        this.media = 'all';
      };
      link.parentNode.insertBefore(newLink, link.nextSibling);
    }
  });
  
  // Inline critical CSS
  const criticalCss = \`
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    img { max-width: 100%; height: auto; }
  \`;
  
  const style = document.createElement('style');
  style.textContent = criticalCss;
  document.head.insertBefore(style, document.head.firstChild);
})();
`.trim();
  }

  private generateGeneralOptimizationScript(): string {
    return `
// General Performance Optimization
(function() {
  // Defer non-critical JavaScript
  const scripts = document.querySelectorAll('script[data-defer]');
  scripts.forEach(script => {
    script.defer = true;
  });
  
  // Preload critical resources
  const preloadLinks = document.querySelectorAll('link[rel="preload"]');
  preloadLinks.forEach(link => {
    if (!link.hasAttribute('as')) {
      link.setAttribute('as', 'script');
    }
  });
  
  // Enable compression
  if (navigator.sendBeacon) {
    window.addEventListener('beforeunload', () => {
      navigator.sendBeacon('/api/performance', JSON.stringify({
        timing: performance.timing,
        navigation: performance.navigation
      }));
    });
  }
})();
`.trim();
  }
}
