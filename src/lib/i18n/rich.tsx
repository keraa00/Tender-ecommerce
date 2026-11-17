import { Fragment, type ReactNode } from "react";

/**
 * `format()` for sentences with markup inside: fills `{name}` placeholders with
 * React nodes, so "Tender takes {rate} of each order" stays one sentence to
 * translate while `{rate}` is drawn in bold. Each language puts the
 * placeholder wherever its grammar wants it.
 *
 * Unknown names are left as written, like `format()`.
 */
export function formatRich(
  template: string,
  values: Record<string, ReactNode>,
): ReactNode {
  return template.split(/\{(\w+)\}/g).map((part, index) =>
    index % 2 === 0 ? (
      part
    ) : (
      <Fragment key={index}>{part in values ? values[part] : `{${part}}`}</Fragment>
    ),
  );
}
