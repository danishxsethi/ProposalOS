import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    externalDir: true,
  },
  // Disable turbopack for bundle analysis (not compatible)
  ...(process.env.ANALYZE === 'true'
    ? {}
    : {
        turbopack: {
          root: __dirname,
        },
      }),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // Performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Code splitting hints
  webpack: (config, { isServer }) => {
    // Split vendor chunks
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        // Vendor chunk for node_modules
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: -10,
        },
        // Separate chunk for visualization libs
        visualization: {
          test: /[\\/]node_modules[\\/](recharts|d3|@react-google-maps)[\\/]/,
          name: 'visualization',
          chunks: 'all',
          priority: -5,
        },
        // Separate chunk for animations
        animations: {
          test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
          name: 'animations',
          chunks: 'all',
          priority: -5,
        },
        // Common chunk for shared code
        common: {
          name: 'common',
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    };

    // Return config
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
