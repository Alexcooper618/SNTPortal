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
const ogImagePath = "/images/landing/og-abstract-1200x630.png";
const yandexVerificationDefault = "ba4cea3ee75f815b";
const metadataBase = (() => {
  try {
    return new URL(baseUrlRaw);
  } catch (_error) {
    return new URL("https://snt-portal.ru");
  }
})();
const siteUrl = metadataBase.toString().replace(/\/$/, "");
const ogImageAbsoluteUrl = `${siteUrl}${ogImagePath}`;

export const metadata: Metadata = {
  applicationName: "SNTPortal",
  metadataBase,
  title: {
    default: "SNTPortal - цифровая платформа для СНТ",
    template: "%s | SNTPortal",
  },
  description:
    "Современная платформа для СНТ: новости, документы, голосования, обращения, платежи и администрирование в едином контуре.",
  keywords: [
    "СНТ",
    "портал СНТ",
    "цифровая платформа СНТ",
    "голосования СНТ",
    "документы СНТ",
    "обращения СНТ",
    "управление товариществом",
  ],
  authors: [{ name: "SNTPortal" }],
  creator: "SNTPortal",
  publisher: "SNTPortal",
  category: "technology",
  referrer: "origin-when-cross-origin",
  alternates: {
    canonical: "/",
    languages: {
      "ru-RU": "/",
      "x-default": "/",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "SNTPortal - современная цифровая платформа для СНТ",
    description:
      "Единая платформа для жителей и председателя: коммуникации, документы, голосования, платежи и контроль обращений.",
    url: siteUrl,
    siteName: "SNTPortal",
    type: "website",
    locale: "ru_RU",
    images: [
      {
        url: ogImagePath,
        width: 1200,
        height: 630,
        alt: "SNTPortal - цифровая платформа для СНТ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SNTPortal - современная платформа для СНТ",
    description:
      "Цифровизация СНТ: единый контур управления коммуникациями, документами и сервисами.",
    images: [ogImageAbsoluteUrl],
  },
  verification: {
    google: process.env.LANDING_GOOGLE_SITE_VERIFICATION,
    yandex: process.env.LANDING_YANDEX_SITE_VERIFICATION ?? yandexVerificationDefault,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#f3f7fc",
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
