import type { MetadataRoute } from "next";

const baseUrlRaw = process.env.LANDING_BASE_URL ?? "https://snt-portal.ru";
const siteUrl = (() => {
  try {
    return new URL(baseUrlRaw);
  } catch (_error) {
    return new URL("https://snt-portal.ru");
  }
})();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl.origin}/sitemap.xml`,
    host: siteUrl.host,
  };
}
