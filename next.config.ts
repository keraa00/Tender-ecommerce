import type { NextConfig } from "next";

import { deriveAdminHost, splitHost } from "./src/lib/admin/host";

const appUrl = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL)
  : null;

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

/**
 * The dev server refuses cross-origin requests to its own internal endpoints,
 * and the seller admin is a different origin by design. Without this, loading
 * `admin.localhost:3000` gets the page but not fast refresh.
 *
 * Hostnames only — `allowedDevOrigins` does not take a port.
 */
const adminDevOrigin = appUrl
  ? splitHost(
      process.env.NEXT_PUBLIC_ADMIN_HOST || deriveAdminHost(appUrl.host),
    )[0]
  : null;

const nextConfig: NextConfig = {
  ...(adminDevOrigin ? { allowedDevOrigins: [adminDevOrigin] } : {}),
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
