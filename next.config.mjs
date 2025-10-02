/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: "export", // Removed for Cloudflare Pages SSG support
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
