import Link from "next/link";

import { defineSection } from "../define";
import { field } from "../fields";

export default defineSection({
  type: "footer",
  name: "Footer",
  description: "Links and your store’s name.",
  layout: "full-bleed",
  pinned: "footer",
  settings: {
    showPoweredBy: field.checkbox({
      label: "Show “Powered by Tender”",
      default: true,
    }),
  },
  Component({ section, ctx }) {
    const { store, t, nav } = ctx;

    return (
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {section.settings.showPoweredBy ? (
            <p>
              © {store.name} · {t.footer.poweredBy}{" "}
              <Link href="/" className="underline underline-offset-4">
                Tender
              </Link>
            </p>
          ) : (
            <p>© {store.name}</p>
          )}
        </div>
      </footer>
    );
  },
});
