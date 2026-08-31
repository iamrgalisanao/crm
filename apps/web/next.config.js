/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crm/shared'],
  output: 'standalone', // self-contained server for Docker
  // Type-checking still runs on build; ESLint is run separately (dev / CI) so a
  // cosmetic lint rule can't block a production build.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
