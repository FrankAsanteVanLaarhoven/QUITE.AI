"use client";

import { useEffect } from "react";

export function useListKeys(ids: string[], selected: string | null, onSelect: (id: string) => void) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
      if (typing || event.metaKey || event.ctrlKey || event.altKey || ids.length === 0) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      event.preventDefault();
      const index = Math.max(0, ids.indexOf(selected ?? ids[0]));
      const next = key === "j" ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1);
      onSelect(ids[next] ?? ids[0]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, onSelect, selected]);
}
