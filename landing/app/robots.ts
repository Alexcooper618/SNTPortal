import type { MetadataRoute } from "next";

const baseUrl = process.env.LANDING_BASE_URL ?? "https://snt-portal.ru";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
    host: baseUrl.replace(/\/$/, ""),
  };
}
