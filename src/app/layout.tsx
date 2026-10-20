import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SplashScreen } from "@/components/SplashScreen";
import { InstallPromptListener } from "@/components/InstallPromptListener";
import { OfflineSyncListener } from "@/components/OfflineSyncListener";
import { GlobalHapticListener } from "@/components/GlobalHapticListener";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  // Absolute base for the link-preview image (src/app/opengraph-image.png),
  // so WhatsApp/email previews show our logo rather than a Vercel default.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.wmfixandfinish.co.za"),
  title: "Meter Readings",
  description: "Electricity and water meter readings for your property.",
  openGraph: {
    title: "WM — Wayne's Meter Readings",
    description: "Electricity and water meter readings for your property.",
    siteName: "WM — Wayne's Meter Readings",
    type: "website",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Meter Readings",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c1f3d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white" suppressHydrationWarning>
        <SplashScreen />
        <InstallPromptListener />
        <OfflineSyncListener />
        <GlobalHapticListener />
        {children}
      </body>
    </html>
  );
}
