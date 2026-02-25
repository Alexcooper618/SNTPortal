import type { Metadata, Viewport } from "next";
import { Golos_Text, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const bodyFont = Golos_Text({
  subsets: ["cyrillic", "latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Source_Serif_4({
  subsets: ["cyrillic", "latin", "latin-ext"],
  variable: "--font-display",
  display: "swap",
});

const baseUrlRaw = process.env.LANDING_BASE_URL ?? "https://snt-portal.ru";
const ogImagePath = "/images/landing/og-abstract-v1.png";
const metadataBase = (() => {
  try {
    return new URL(baseUrlRaw);
  } catch (_error) {
    return new URL("https://snt-portal.ru");
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: "SNTPortal - цифровая платформа для СНТ",
  description:
    "Современная платформа для СНТ: новости, документы, голосования, обращения, платежи и администрирование в едином контуре.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SNTPortal - современная цифровая платформа для СНТ",
    description:
      "Единая платформа для жителей и председателя: коммуникации, документы, голосования, платежи и контроль обращений.",
    url: "/",
    siteName: "SNTPortal",
    type: "website",
    locale: "ru_RU",
    images: [
      {
        url: ogImagePath,
        width: 1536,
        height: 1024,
        alt: "SNTPortal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SNTPortal - современная платформа для СНТ",
    description:
      "Цифровизация СНТ: единый контур управления коммуникациями, документами и сервисами.",
    images: [ogImagePath],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f7fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
