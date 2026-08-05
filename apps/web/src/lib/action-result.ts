import { InsufficientStockError, InUseError } from "@vimar/core";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/**
 * Turn a thrown error into something worth showing Vicky. Domain errors carry
 * their own wording; anything else is logged and reported generically so an
 * internal message never leaks into the UI.
 */
export function toActionError(error: unknown): ActionResult {
  if (error instanceof InsufficientStockError) {
    return { ok: false, error: `Not enough stock — ${error.shortfalls.join("; ")}` };
  }
  if (error instanceof InUseError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error && error.message) {
    return { ok: false, error: error.message };
  }
  console.error("Unexpected action failure:", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
