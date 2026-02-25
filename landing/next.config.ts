import type { NextConfig } from "next";

const landingDomain = process.env.LANDING_DOMAIN ?? "snt-portal.ru";
const landingWwwDomain = process.env.LANDING_WWW_DOMAIN ?? `www.${landingDomain}`;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: landingWwwDomain }],
        destination: `https://${landingDomain}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
