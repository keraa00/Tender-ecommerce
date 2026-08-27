import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted text-pretty">
          That page doesn&rsquo;t exist, or you don&rsquo;t have access to it.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
        >
          Back to Tender
        </Link>
      </div>
    </div>
  );
}
