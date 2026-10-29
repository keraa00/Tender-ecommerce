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

/**
 * Sent on every response. Nothing here is framed by another site: the one
 * frame the app draws is the theme editor's preview, on the admin's own host,
 * so `frame-ancestors 'self'` keeps checkout and the admin out of a
 * clickjacking page without breaking it. Stripe's iframes are pages we frame,
 * which this does not touch.
 *
 * `payment` is deliberately absent from Permissions-Policy: Apple Pay and
 * Google Pay run inside Stripe's iframe and need it delegated.
 *
 * Only `frame-ancestors` of a Content-Security-Policy so far — a `script-src`
 * needs per-request nonces and Stripe's and Supabase's hosts allowlisted.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Production builds only: a dev server answers on plain http.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
    : []),
];

const nextConfig: NextConfig = {
  ...(adminDevOrigin ? { allowedDevOrigins: [adminDevOrigin] } : {}),
  experimental: {
    serverActions: {
      // Product photos post with the product form — up to eight at once, each
      // already scaled down in the browser to `MAX_IMAGE_BYTES` (see
      // `src/lib/products/constants.ts`). The default is 1MB for the whole
      // request; this stays under Vercel's 4.5MB cap on a function's body.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
