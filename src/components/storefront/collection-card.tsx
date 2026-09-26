import Image from "next/image";
import Link from "next/link";

export function CollectionCard({
  href,
  title,
  countLabel,
  cover,
}: {
  href: string;
  title: string;
  countLabel: string;
  cover: { url: string; altText: string | null } | null;
}) {
  return (
    <Link
      href={href}
      className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-surface-subtle"
    >
      {cover ? (
        <Image
          src={cover.url}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : null}
      {/* Scrim so white text stays legible over any photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <p className="text-lg font-semibold tracking-tight">{title}</p>
        <p className="text-sm text-white/80">{countLabel}</p>
      </div>
    </Link>
  );
}
