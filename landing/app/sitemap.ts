import type { MetadataRoute } from "next";

const baseUrl = (process.env.LANDING_BASE_URL ?? "https://snt-portal.ru").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
