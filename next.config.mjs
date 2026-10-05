/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  cacheComponents: false,
  turbopack: { root: process.cwd() },
  // Let OpenNext copy the complete workerd export used by node-postgres.
  serverExternalPackages: ["pg-cloudflare"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
