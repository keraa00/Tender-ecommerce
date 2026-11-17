import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The origin relative Open Graph and canonical URLs resolve against. Read
 * from the environment, like every absolute URL the app builds, so a preview
 * or a misconfigured host never ends up in a shared link.
 */
function metadataBase(): URL | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: "Tender — open a store, take payments",
    template: "%s · Tender",
  },
  description:
    "A multi-tenant e-commerce demo. Sign up, open a store, list products and " +
    "take test payments through Stripe Connect.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `data-scroll-behavior`: the landing pages scroll smoothly (globals.css);
    // this has Next drop to an instant scroll while it changes routes.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
