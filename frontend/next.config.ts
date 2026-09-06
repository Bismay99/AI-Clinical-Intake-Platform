import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/doctor/login",
        destination: "/staff-login",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
