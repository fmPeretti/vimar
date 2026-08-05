"use client";

import { useCallback, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

/**
 * Runs a server action inside a transition and surfaces its pending/error
 * state, so every screen handles failures the same way instead of each form
 * inventing its own.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(
    <T extends ActionResult>(action: () => Promise<T>, onSuccess?: (result: T) => void) => {
      setError(null);
      setMessage(null);
      startTransition(async () => {
        try {
          const result = await action();
          if (result.ok) {
            setMessage(result.message ?? null);
            onSuccess?.(result);
          } else {
            setError(result.error);
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Something went wrong.");
        }
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  return { run, pending, error, message, reset };
}
