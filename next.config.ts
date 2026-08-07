import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Hosts behind the openly-licensed seed photography in
      // prisma/seed-images.json. Listed explicitly rather than wildcarded —
      // next/image will proxy and cache anything allowed here, so the list is
      // a real trust boundary, not just configuration.
      { protocol: "https", hostname: "live.staticflickr.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "pd.w.org" },
      // Seller-uploaded product images live in Supabase Storage.
      ...(supabaseHost
        ? ([
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ] as const)
        : []),
    ],
  },
};

export default nextConfig;
