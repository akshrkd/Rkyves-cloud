"use client";

import { useEffect, useRef } from "react";

export function useSmartPolling(
  callback: () => void,
  intervalMs: number,
  enabled = true
) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (id) return;
      id = setInterval(() => saved.current(), intervalMs);
    }

    function stop() {
      if (id) {
        clearInterval(id);
        id = null;
      }
    }

    function onVisibility() {
      if (document.hidden) stop();
      else {
        saved.current();
        start();
      }
    }

    if (!document.hidden) {
      saved.current();
      start();
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
