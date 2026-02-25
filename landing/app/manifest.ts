import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SNTPortal",
    short_name: "SNTPortal",
    description: "Цифровая платформа для управления коммуникациями и сервисами СНТ.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f0e4",
    theme_color: "#0f3b33",
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
