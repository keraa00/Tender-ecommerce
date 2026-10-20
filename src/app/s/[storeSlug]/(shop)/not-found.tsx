import Link from "next/link";

export default function StoreNotFound() {
  return (
    <div className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          No store at this address
        </h1>
        <p className="mt-2 text-sm text-muted text-pretty">
          The link may be mistyped, or the seller may have closed up shop.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
        >
          Browse stores on Tender
        </Link>
      </div>
    </div>
  );
}
