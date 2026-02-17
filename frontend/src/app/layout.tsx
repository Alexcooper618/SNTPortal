import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "СНТ Портал",
  description: "Портал жителей и председателя",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f3efe6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeApiUrl = process.env.SNT_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  return (
    <html lang="ru">
      <head>
        <script
          // Provide runtime API base URL for client bundles (avoids rebuilds for env changes).
          dangerouslySetInnerHTML={{
            __html: `window.__SNT_API_URL__=${JSON.stringify(runtimeApiUrl)};`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
