import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  env: {
    API_URL: process.env.API_URL,
  },
};

export default nextConfig;
