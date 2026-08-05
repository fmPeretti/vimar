import "server-only";

/**
 * The app talks to storage only through this bundle. Swapping SQLite for
 * something else means pointing this at a different implementation of the
 * `Repositories` interface — no screen or action changes.
 */
export { repositories } from "@vimar/db";
