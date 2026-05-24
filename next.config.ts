import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localtunnel 등 외부 접속 허용
  allowedDevOrigins: [
    'gradius-erp.loca.lt',
    '*.loca.lt',
  ],
};

export default nextConfig;
