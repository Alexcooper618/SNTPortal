import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SNTPortal",
    short_name: "SNTPortal",
    description: "Цифровая платформа для управления коммуникациями и сервисами СНТ.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f7fc",
    theme_color: "#005fcc",
    lang: "ru",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
