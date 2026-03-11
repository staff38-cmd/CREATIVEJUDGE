import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true, // サーバーOOM対策: 型チェックはローカルで実施
  },
  eslint: {
    ignoreDuringBuilds: true, // 同上
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
