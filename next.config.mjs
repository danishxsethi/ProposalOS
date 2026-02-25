/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    typescript: {
        ignoreBuildErrors: true,
    },
    env: {
        SKIP_ENV_VALIDATION: 'true',
    },
};

export default nextConfig;
