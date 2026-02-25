import type { MetadataRoute } from "next";

const baseUrl = (process.env.LANDING_BASE_URL ?? "https://snt-portal.ru").replace(/\/$/, "");
const canonicalUrl = `${baseUrl}/`;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: canonicalUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          "ru-RU": canonicalUrl,
          "x-default": canonicalUrl,
        },
      },
    },
  ];
}
