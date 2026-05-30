/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
