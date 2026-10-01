"use client";

import Image from "next/image";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/**
 * Chooses a set of things — products, collections, customers — from a list
 * with a filter. Each choice posts as a repeated hidden `name` field, so the
 * picker needs no JavaScript to *submit*, only to change.
 *
 * `parseEntry` lets a picker accept things that are not in its list: the
 * customer picker takes any email typed or pasted, one or many at once.
 */

export type PickerOption = {
  id: string;
  label: string;
  /** A second, quieter line: a status, an email, a count. */
  detail?: string | null;
  imageUrl?: string | null;
};

/** Rendering thousands of rows helps nobody; the filter is the way through. */
const MAX_SHOWN = 50;

export function ItemPicker({
  name,
  label,
  options,
  selected,
  onChange,
  placeholder,
  empty,
  parseEntry,
  invalid = false,
}: {
  name: string;
  /** Names the filter box for screen readers: "Find products". */
  label: string;
  options: readonly PickerOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** Shown instead of the list when there is nothing to pick from. */
  empty: ReactNode;
  parseEntry?: (query: string) => string[];
  invalid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();

  const byId = new Map(options.map((option) => [option.id, option]));
  const chosen = new Set(selected);
  const needle = query.trim().toLowerCase();

  const matches = options.filter(
    (option) =>
      !chosen.has(option.id) &&
      (needle === "" ||
        option.label.toLowerCase().includes(needle) ||
        (option.detail ?? "").toLowerCase().includes(needle)),
  );
  const shown = matches.slice(0, MAX_SHOWN);

  const typed = parseEntry
    ? parseEntry(query).filter((entry) => !chosen.has(entry) && !byId.has(entry))
    : [];

  function add(ids: string[]) {
    onChange([...selected, ...ids.filter((id) => !chosen.has(id))]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    // Enter in a text box would otherwise submit the whole discount form.
    event.preventDefault();
    if (typed.length > 0) {
      add(typed);
      setQuery("");
    } else if (shown.length > 0 && needle !== "") {
      add([shown[0].id]);
      setQuery("");
    }
  }

  return (
    <div className="space-y-3">
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Chosen">
          {selected.map((id) => {
            const option = byId.get(id);
            const text = option?.label ?? id;
            return (
              <li
                key={id}
                className="flex max-w-full items-center gap-1 rounded-full border border-border-strong bg-surface py-1 pr-1 pl-3 text-sm"
              >
                <span className="truncate">{text}</span>
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((entry) => entry !== id))}
                  aria-label={`Remove ${text}`}
                  title={`Remove ${text}`}
                  className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {options.length === 0 && !parseEntry ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={label}
            aria-controls={listId}
            aria-invalid={invalid}
            autoComplete="off"
          />

          <ul
            id={listId}
            className="max-h-60 divide-y divide-border overflow-y-auto rounded-xl border border-border empty:hidden"
          >
            {typed.length > 0 ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    add(typed);
                    setQuery("");
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {typed.length === 1 ? typed[0] : `${typed.length} email addresses`}
                  </span>
                  <span className="shrink-0 font-medium text-muted">Add</span>
                </button>
              </li>
            ) : null}

            {shown.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => add([option.id])}
                  className="flex w-full cursor-pointer items-center gap-3 bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  {option.imageUrl !== undefined ? <Thumb url={option.imageUrl} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{option.label}</span>
                    {option.detail ? (
                      <span className="block truncate text-xs text-muted">{option.detail}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-muted">Add</span>
                </button>
              </li>
            ))}
          </ul>

          <p className={cn("text-xs text-muted", matches.length <= MAX_SHOWN && "sr-only")}>
            {matches.length > MAX_SHOWN
              ? `Showing ${MAX_SHOWN} of ${matches.length}. Type to narrow the list.`
              : `${matches.length} available.`}
          </p>

          {options.length === 0 && typed.length === 0 ? (
            <p className="text-sm text-muted">{empty}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Thumb({ url }: { url: string | null | undefined }) {
  return (
    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-surface-subtle">
      {url ? <Image src={url} alt="" fill sizes="32px" className="object-cover" /> : null}
    </span>
  );
}
