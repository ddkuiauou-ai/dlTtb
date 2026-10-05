/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  cacheComponents: false,
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1"],
  // Let OpenNext copy the complete workerd export used by node-postgres.
  serverExternalPackages: ["pg-cloudflare"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
