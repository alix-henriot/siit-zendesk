import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { ZafProvider } from "@/components/zaf-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Siit-Zendesk",
  description: "Siit integration in Zendesk",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Strategy beforeInteractive guarantees the script has loaded before React hydrates and window.ZAFClient can be used safely */}
        <Script
        src="https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js"
        strategy="beforeInteractive"
        />
        <ZafProvider>{children}</ZafProvider>
      </body>
    </html>
  );
}
