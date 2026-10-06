"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  PREVIEW_FOCUS,
  PREVIEW_READY,
  PREVIEW_REFRESH,
  PREVIEW_SECTION_ATTRIBUTE,
  PREVIEW_SELECT,
  readPreviewMessage,
} from "@/lib/theme/preview";

/**
 * The preview iframe's half of the editor contract: re-render when the editor
 * says the staged document changed, scroll to the section it selects, tell it
 * which section the seller clicked, and keep the seller on this page.
 *
 * A refresh re-runs the page on the server — the real storefront components,
 * the store's real catalogue — without reloading the frame, so the scroll
 * position survives each edit.
 *
 * Links and forms are inert here. The storefront's links point at the public
 * storefront on the root host, which would show the *published* design inside
 * the editor's frame and look like the edits had been lost.
 */
export function PreviewBridge() {
  const router = useRouter();

  useEffect(() => {
    const toEditor = (message: unknown) => {
      if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = readPreviewMessage(event.data);
      if (message?.type === PREVIEW_REFRESH) router.refresh();
      if (message?.type === PREVIEW_FOCUS) {
        // The tag has no box of its own; scroll to what it holds.
        const tag = [...document.querySelectorAll(`[${PREVIEW_SECTION_ATTRIBUTE}]`)].find(
          (element) => element.getAttribute(PREVIEW_SECTION_ATTRIBUTE) === message.sectionId,
        );
        tag?.firstElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };

    // Capture phase, ahead of React's own handlers: `<Link>` sees the event
    // already prevented and does not navigate. Buttons — the cart, the menu —
    // keep working, so the seller can try them.
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("a[href]")) event.preventDefault();

      const tag = event.target.closest(`[${PREVIEW_SECTION_ATTRIBUTE}]`);
      const sectionId = tag?.getAttribute(PREVIEW_SECTION_ATTRIBUTE);
      if (sectionId) toEditor({ type: PREVIEW_SELECT, sectionId });
    };
    const onSubmit = (event: SubmitEvent) => event.preventDefault();

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);

    toEditor({ type: PREVIEW_READY });

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [router]);

  return null;
}
