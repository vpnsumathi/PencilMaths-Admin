import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Homework photos are sent one at a time (shrunk on the phone); allow up to 5 MB each.
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
};

export default nextConfig;