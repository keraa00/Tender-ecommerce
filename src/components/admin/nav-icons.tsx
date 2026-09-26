import type { AdminIcon } from "@/lib/admin/nav";

/**
 * Line icons for the admin drawer, inlined rather than pulled from an icon
 * package: a handful of glyphs do not justify a dependency, and these ship as part of
 * the component tree instead of as a separate request.
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
