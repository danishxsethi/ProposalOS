/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    SKIP_ENV_VALIDATION: 'true',
  },
  // Headers for locale-aware responses without legacy App Router i18n config
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Vary',
            value: 'Accept-Language',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
