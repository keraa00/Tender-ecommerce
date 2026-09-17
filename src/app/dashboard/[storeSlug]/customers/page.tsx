import type { Metadata } from "next";

import {
  AdminPage,
  EmptyState,
  Row,
  Rows,
} from "@/components/admin/page-shell";
import { Badge } from "@/components/ui/badge";
import { listStoreCustomers } from "@/lib/customers/queries";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getStoreContext } from "@/lib/stores/context";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/customers">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Customers · ${store.name}` };
}

export default async function CustomersPage(
  props: PageProps<"/dashboard/[storeSlug]/customers">,
) {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);

  const customers = await listStoreCustomers(store.id);

  return (
    <AdminPage
      title="Customers"
      description={
        customers.length === 0
          ? "Everyone who has bought from this store, with what they have spent."
          : `${customers.length} ${customers.length === 1 ? "customer" : "customers"}, highest spend first.`
      }
    >
      {customers.length === 0 ? (
        <EmptyState title="No customers yet">
          A customer appears here after their first paid order. Guests count too
          — they are grouped by the email they checked out with.
        </EmptyState>
      ) : (
        <Rows>
          {customers.map((customer) => (
            <Row key={customer.email}>
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-subtle text-sm font-medium text-muted ring-1 ring-border ring-inset"
              >
                {(customer.name ?? customer.email).charAt(0).toUpperCase()}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  <span className="truncate">
                    {customer.name ?? customer.email}
                  </span>
                  {customer.hasAccount ? null : (
                    <Badge>Guest</Badge>
                  )}
                </p>
                <p className="truncate text-sm text-muted tabular">
                  {customer.name ? `${customer.email} · ` : ""}
                  {customer.orders}{" "}
                  {customer.orders === 1 ? "order" : "orders"} · last{" "}
                  {formatDate(customer.lastOrderAt)}
                </p>
              </div>

              <div className="shrink-0 text-right font-medium tabular">
                {formatMoney(customer.spentCents)}
              </div>
            </Row>
          ))}
        </Rows>
      )}
    </AdminPage>
  );
}
