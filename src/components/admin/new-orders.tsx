"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { useAdminI18n } from "@/components/admin/admin-i18n";
import type { AdminMessages } from "@/lib/i18n/admin";
import { getUnseenOrdersAction, markOrdersSeenAction } from "@/lib/orders/actions";
import {
  ORDER_PAID_EVENT,
  describeNewOrders,
  newOrdersReducer,
  readOrderPaidPayload,
  storeOrdersTopic,
  toNewOrdersState,
  type UnseenOrders,
} from "@/lib/orders/live";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * New paid orders, live, for the whole seller admin.
 *
 * Orders are never pushed into a list the seller is reading. A payment only
 * moves a count — the number beside Orders in the drawer, and the notice on the
 * orders list — and the list itself changes when the seller asks it to. Ten
 * orders in a minute are one number going up, not ten rows jumping in.
 *
 * Mounted by the admin layout, so it outlives navigation between sections and
 * holds one Realtime subscription for as long as the admin is open.
 */

type NewOrders = {
  storeSlug: string;
  count: number;
  /** "3 new orders", in the seller's language. */
  describe: (count: number) => string;
  /** Replaces the count with the database's, from one of the order actions. */
  sync: (load: () => Promise<UnseenOrders>) => void;
};

const NewOrdersContext = createContext<NewOrders | null>(null);

export function useNewOrders(): NewOrders {
  const value = useContext(NewOrdersContext);
  if (!value) throw new Error("useNewOrders() needs a <NewOrdersProvider> above it.");
  return value;
}

export function NewOrdersProvider({
  storeId,
  storeSlug,
  initial,
  t,
  children,
}: {
  storeId: string;
  storeSlug: string;
  /** Read by the layout, so the first paint already has the right number. */
  initial: UnseenOrders;
  t: AdminMessages["liveOrders"];
  children: ReactNode;
}) {
  const { locale } = useAdminI18n();
  const [state, dispatch] = useReducer(newOrdersReducer, initial, toNewOrdersState);

  // The layout reads the count again whenever the route is refreshed. Take it
  // during render rather than in an effect, as the shell does with its segment,
  // so a stale number is never painted.
  const initialKey = `${initial.seenThroughMs}:${initial.ids.join(",")}`;
  const [renderedKey, setRenderedKey] = useState(initialKey);
  if (initialKey !== renderedKey) {
    setRenderedKey(initialKey);
    dispatch({ type: "synced", unseen: initial });
  }

  // Server actions resolve in the order they were sent, but a sync started
  // before a "mark seen" must not land after it and bring the count back.
  const latestSync = useRef(0);
  const sync = useCallback((load: () => Promise<UnseenOrders>) => {
    const request = ++latestSync.current;
    startTransition(async () => {
      try {
        const unseen = await load();
        if (request === latestSync.current) dispatch({ type: "synced", unseen });
      } catch (error) {
        // The count stays as it was; the next sync puts it right.
        console.warn("Could not refresh the new order count.", error);
      }
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let closed = false;

    // A private channel: Realtime checks the member's token against the policy
    // on `realtime.messages` before letting them join this store's topic.
    supabase.realtime
      .setAuth()
      .then(() => {
        if (closed) return;
        channel = supabase
          .channel(storeOrdersTopic(storeId), { config: { private: true } })
          .on("broadcast", { event: ORDER_PAID_EVENT }, ({ payload }) => {
            const order = readOrderPaidPayload(payload);
            if (order) dispatch({ type: "received", order });
          })
          .subscribe((status) => {
            // Every join may follow a gap — the page loading, a laptop waking,
            // a dropped connection — in which announcements went nowhere.
            if (status === "SUBSCRIBED") sync(() => getUnseenOrdersAction(storeSlug));
          });
      })
      .catch((error: unknown) => {
        console.warn("Could not subscribe to new orders.", error);
      });

    return () => {
      closed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [storeId, storeSlug, sync]);

  // Coming back to the tab: the connection may have been throttled meanwhile,
  // and another tab may have marked the orders seen.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sync(() => getUnseenOrdersAction(storeSlug));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [storeSlug, sync]);

  const count = state.ids.size;
  const describe = useCallback(
    (n: number) => describeNewOrders(n, locale, t),
    [locale, t],
  );
  const value = useMemo(
    () => ({ storeSlug, count, sync, describe }),
    [storeSlug, count, sync, describe],
  );

  return <NewOrdersContext.Provider value={value}>{children}</NewOrdersContext.Provider>;
}

/**
 * The orders list's side of it. Rendering marks everything paid up to the
 * list's own render as seen; after that, new payments raise a single notice
 * that refreshes the list when clicked, and the refreshed list marks those
 * seen in turn.
 *
 * Floats over the top of the list rather than taking room in it, so its
 * arrival never shifts a row out from under the seller's pointer.
 */
export function NewOrdersNotice({
  renderedAt,
  t,
}: {
  renderedAt: string;
  t: AdminMessages["liveOrders"];
}) {
  const { storeSlug, count, sync, describe } = useNewOrders();
  const router = useRouter();
  const [updating, startUpdate] = useTransition();

  useEffect(() => {
    sync(() => markOrdersSeenAction(storeSlug, renderedAt));
  }, [renderedAt, storeSlug, sync]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none sticky top-20 z-20 flex h-0 justify-center lg:top-8"
    >
      {count > 0 ? (
        <button
          type="button"
          onClick={() => startUpdate(() => router.refresh())}
          disabled={updating}
          className="pointer-events-auto inline-flex h-8 -translate-y-1/2 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/85 disabled:cursor-default disabled:opacity-80"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={updating ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          <span className="tabular">{describe(count)}</span>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          <span>{updating ? t.updating : t.clickToUpdate}</span>
        </button>
      ) : null}
    </div>
  );
}
