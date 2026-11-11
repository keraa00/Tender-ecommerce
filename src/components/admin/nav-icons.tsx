import type { AdminIcon } from "@/lib/admin/nav";

/**
 * Line icons for the admin drawer and the tabs inside Settings and account
 * settings, inlined rather than pulled from an icon package: a handful of
 * glyphs do not justify a dependency, and these ship as part of the component
 * tree instead of as a separate request.
 */

type IconProps = { className?: string };

function Svg({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

const icons: Record<AdminIcon, (props: IconProps) => React.ReactElement> = {
  home: (props) => (
    <Svg {...props}>
      <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 21v-7h6v7" />
    </Svg>
  ),
  orders: (props) => (
    <Svg {...props}>
      <path d="M6 2h12l1 4H5z" />
      <path d="M5 6v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6" />
      <path d="M9 10a3 3 0 0 0 6 0" />
    </Svg>
  ),
  products: (props) => (
    <Svg {...props}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </Svg>
  ),
  collections: (props) => (
    <Svg {...props}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </Svg>
  ),
  customers: (props) => (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.5a3 3 0 0 1 0 5.8" />
      <path d="M18 14.5a5.5 5.5 0 0 1 3 5.5" />
    </Svg>
  ),
  discounts: (props) => (
    <Svg {...props}>
      <path d="M20.6 11.4 12.6 3.4a2 2 0 0 0-1.4-.6H5a2 2 0 0 0-2 2v6.2a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8z" />
      <circle cx="7.8" cy="7.8" r="1.3" />
    </Svg>
  ),
  analytics: (props) => (
    <Svg {...props}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </Svg>
  ),
  "online-store": (props) => (
    <Svg {...props}>
      <path d="M4 9.5 5.5 4h13L20 9.5" />
      <path d="M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0" />
      <path d="M5 12v8h14v-8" />
      <path d="M10 20v-4.5h4V20" />
    </Svg>
  ),
  settings: (props) => (
    <Svg {...props}>
      <path d="M4 7h9" />
      <path d="M19 7h1" />
      <circle cx="16" cy="7" r="2.5" />
      <path d="M4 17h1" />
      <path d="M11 17h9" />
      <circle cx="8" cy="17" r="2.5" />
    </Svg>
  ),
  general: (props) => (
    <Svg {...props}>
      <path d="M10.39 2.89A9.25 9.25 0 0 1 13.61 2.89L14.09 5.58A6.75 6.75 0 0 1 16.52 6.98L19.09 6.05A9.25 9.25 0 0 1 20.69 8.84L18.6 10.6A6.75 6.75 0 0 1 18.6 13.4L20.69 15.16A9.25 9.25 0 0 1 19.09 17.95L16.52 17.02A6.75 6.75 0 0 1 14.09 18.42L13.61 21.11A9.25 9.25 0 0 1 10.39 21.11L9.91 18.42A6.75 6.75 0 0 1 7.48 17.02L4.91 17.95A9.25 9.25 0 0 1 3.31 15.16L5.4 13.4A6.75 6.75 0 0 1 5.4 10.6L3.31 8.84A9.25 9.25 0 0 1 4.91 6.05L7.48 6.98A6.75 6.75 0 0 1 9.91 5.58Z" />
      <circle cx="12" cy="12" r="2.75" />
    </Svg>
  ),
  payments: (props) => (
    <Svg {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6.5 15h4" />
    </Svg>
  ),
  shipping: (props) => (
    <Svg {...props}>
      <path d="M5 17.5H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v11.5" />
      <path d="M9 17.5h6" />
      <path d="M14 9h4.5l3.5 4v3.5a1 1 0 0 1-1 1h-2" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </Svg>
  ),
  checkout: (props) => (
    <Svg {...props}>
      <path d="M2 3h2.5l2.6 12.2a1.5 1.5 0 0 0 1.5 1.3h9.3a1.5 1.5 0 0 0 1.5-1.2L21 7H5.35" />
      <circle cx="9" cy="20" r="1.25" />
      <circle cx="18" cy="20" r="1.25" />
    </Svg>
  ),
  profile: (props) => (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  ),
  security: (props) => (
    <Svg {...props}>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 15v2" />
    </Svg>
  ),
  privacy: (props) => (
    <Svg {...props}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
};

export function NavIcon({
  name,
  className,
}: {
  name: AdminIcon;
  className?: string;
}) {
  return icons[name]({ className });
}
