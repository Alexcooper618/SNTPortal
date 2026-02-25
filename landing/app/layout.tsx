import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Spectral } from "next/font/google";
import "./globals.css";

const bodyFont = Space_Grotesk({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Spectral({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const baseUrlRaw = process.env.LANDING_BASE_URL ?? "https://snt-portal.ru";
const metadataBase = (() => {
  try {
    return new URL(baseUrlRaw);
  } catch (_error) {
    return new URL("https://snt-portal.ru");
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: "SNTPortal",
  description:
    "Цифровой портал для СНТ: коммуникации, документы, голосования, платежи, инциденты и единая админ-панель.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SNTPortal - цифровой портал СНТ",
    description:
      "Единая платформа для жителей и председателя: новости, документы, голосования, платежи, инциденты и чат.",
    url: "/",
    siteName: "SNTPortal",
    type: "website",
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: "SNTPortal - цифровой портал СНТ",
    description:
      "Единая цифровая платформа для управления коммуникацией, документами и сервисами внутри СНТ.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f3b33",
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
