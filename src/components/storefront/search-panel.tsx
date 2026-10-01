"use client";

import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import {
  matchRanges,
  normalizeSearchQuery,
  SEARCH_QUERY_MAX,
  searchTerms,
} from "@/lib/products/search";
import { SearchIcon } from "./icons";
import { Sheet, usePanel } from "./storefront-ui";
import type { SearchMessages, SearchSuggestions } from "./types";

/** Long enough to skip the keystrokes of a word being typed, short enough to feel live. */
const DEBOUNCE_MS = 150;

const iconButton =
  "relative grid h-10 w-10 cursor-pointer place-items-center rounded-lg text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground";

type SearchPanelProps = {
  /** The store's search page; the form is a plain GET to it. */
  action: string;
  /** Answers `?q=` with `SearchSuggestions`, for the results under the field. */
  suggestionsUrl: string;
  label: string;
  closeLabel: string;
  soldOutLabel: string;
  t: SearchMessages;
};

export function SearchPanel(props: SearchPanelProps) {
  const { panel, setPanel } = usePanel();
  const close = () => setPanel(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanel("search")}
        aria-label={props.label}
        aria-expanded={panel === "search"}
        className={iconButton}
      >
        <SearchIcon className="h-5 w-5" />
      </button>

      {/* The sheet unmounts its contents when closed, so each open starts blank. */}
      <Sheet
        open={panel === "search"}
        onClose={close}
        side="top"
        label={props.label}
        closeLabel={props.closeLabel}
      >
        <SearchBox {...props} onDone={close} />
      </Sheet>
    </>
  );
}

/**
 * The search field, with matching products listed under it as the buyer types.
 * Arrow keys move through the results and Enter opens one; Enter with none
 * picked still submits to the full search page.
 */
function SearchBox({
  action,
  suggestionsUrl,
  label,
  closeLabel,
  soldOutLabel,
  t,
  onDone,
}: SearchPanelProps & { onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-results`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<{
    key: string;
    /** Null when the request failed. */
    data: SearchSuggestions | null;
  } | null>(null);
  const [active, setActive] = useState<{ key: string; index: number } | null>(null);
  const cache = useRef(new Map<string, SearchSuggestions>());

  const term = normalizeSearchQuery(query);
  const terms = searchTerms(term);
  // "Shirt", "shirt " and "SHIRT" all ask the same question.
  const key = terms.join(" ");

  useEffect(() => {
    if (key === "") return;

    const controller = new AbortController();
    const cached = cache.current.get(key);
    const timer = window.setTimeout(
      async () => {
        if (cached) {
          setSettled({ key, data: cached });
          return;
        }
        try {
          const response = await fetch(
            `${suggestionsUrl}?${new URLSearchParams({ q: key })}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(`Search failed: ${response.status}`);
          const data = (await response.json()) as SearchSuggestions;
          cache.current.set(key, data);
          setSettled({ key, data });
        } catch {
          if (!controller.signal.aborted) setSettled({ key, data: null });
        }
      },
      cached ? 0 : DEBOUNCE_MS,
    );

    // A newer keystroke cancels this one, so a slow answer to an old query can
    // never land on top of a newer one.
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [suggestionsUrl, key]);

  const fresh = settled?.key === key;
  const loading = key !== "" && !fresh;
  // While the next answer is on its way the last one stays up, dimmed, rather
  // than the list flashing empty on every keystroke.
  const data = key === "" ? null : (settled?.data ?? null);
  const suggestions = data?.suggestions ?? [];
  const noResults = fresh && data?.total === 0;

  const searchHref = `${action}?${new URLSearchParams({ q: term })}`;
  const options = [
    ...suggestions.map((suggestion) => suggestion.href),
    ...(key === "" || noResults ? [] : [searchHref]),
  ];
  const activeIndex =
    active && active.key === settled?.key && active.index < options.length
      ? active.index
      : -1;

  useEffect(() => {
    if (activeIndex >= 0) {
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [id, activeIndex]);

  const highlight = (index: number) => {
    if (settled && index !== activeIndex) setActive({ key: settled.key, index });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter also confirms a word in Japanese and Chinese input methods.
    if (event.nativeEvent.isComposing || options.length === 0 || !settled) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      // -1 is the field itself; stepping past either end returns to it.
      const span = options.length + 1;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive({
        key: settled.key,
        index: ((activeIndex + 1 + step + span) % span) - 1,
      });
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      router.push(options[activeIndex]);
      onDone();
    }
  };

  return (
    <>
      <Form
        action={action}
        onSubmit={onDone}
        role="search"
        className="mx-auto flex h-20 w-full max-w-3xl items-center gap-2 px-4 sm:px-6"
      >
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input
          data-autofocus
          type="search"
          name="q"
          required
          maxLength={SEARCH_QUERY_MAX}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={t.placeholder}
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          className="h-10 shrink-0 cursor-pointer rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--store-accent)" }}
        >
          {t.submit}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 shrink-0 cursor-pointer rounded-lg px-2 text-sm text-muted hover:text-foreground"
        >
          {closeLabel}
        </button>
      </Form>

      <p role="status" className="sr-only">
        {fresh && data ? (noResults ? t.noResults : data.totalLabel) : ""}
      </p>

      {key === "" ? null : (
        <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-2 py-2 sm:px-4">
            {loading && suggestions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">{t.searching}</p>
            ) : null}

            {noResults ? (
              <div className="px-2 py-3">
                <p className="text-sm font-medium">{t.noResults}</p>
                <p className="mt-0.5 text-sm text-muted">{t.noResultsHint}</p>
              </div>
            ) : null}

            <ul
              id={listId}
              role="listbox"
              aria-label={t.suggestions}
              className={cn(
                "transition-opacity",
                loading && suggestions.length > 0 && "opacity-60",
              )}
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onPointerMove={() => highlight(index)}
                >
                  <Link
                    href={suggestion.href}
                    tabIndex={-1}
                    onClick={onDone}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                      index === activeIndex && "bg-surface-hover",
                    )}
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-subtle">
                      {suggestion.image ? (
                        <Image
                          src={suggestion.image.url}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        <Highlighted text={suggestion.title} terms={terms} />
                      </span>
                      <span className="mt-0.5 block text-sm text-muted tabular">
                        {suggestion.price}
                        {suggestion.compareAt ? (
                          <s className="ms-2 text-muted/70">{suggestion.compareAt}</s>
                        ) : null}
                        {suggestion.soldOut ? (
                          <span className="ms-2 text-xs font-medium text-foreground/80">
                            {soldOutLabel}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}

              {options.length > suggestions.length ? (
                <li
                  id={optionId(suggestions.length)}
                  role="option"
                  aria-selected={activeIndex === suggestions.length}
                  onPointerMove={() => highlight(suggestions.length)}
                >
                  <Link
                    href={searchHref}
                    tabIndex={-1}
                    onClick={onDone}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-3 text-sm transition-colors",
                      activeIndex === suggestions.length && "bg-surface-hover",
                    )}
                  >
                    <span className="grid w-12 shrink-0 place-items-center text-muted">
                      <SearchIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t.viewAll.replace("{query}", () => term)}
                    </span>
                    {fresh && data ? (
                      <span className="shrink-0 text-xs text-muted">{data.totalLabel}</span>
                    ) : null}
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/** The title with the parts the query matched in bold. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const [start, end] of matchRanges(text, terms)) {
    if (start > from) parts.push(text.slice(from, start));
    parts.push(
      <mark key={start} className="bg-transparent font-semibold text-current">
        {text.slice(start, end)}
      </mark>,
    );
    from = end;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}
