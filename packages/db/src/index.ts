import type { Repositories } from "@vimar/core";
import { db, type DrizzleDb } from "./client";
import { DrizzleCraftRepository } from "./repositories/craft-repository";
import { DrizzleEventRepository } from "./repositories/event-repository";
import { DrizzleMaterialRepository } from "./repositories/material-repository";
import { DrizzlePatternRepository } from "./repositories/pattern-repository";
import { DrizzleTagRepository } from "./repositories/tag-repository";

/** Build a repository bundle over any Drizzle handle (the app, a test, a script). */
export function createRepositories(handle: DrizzleDb): Repositories {
  const tags = new DrizzleTagRepository(handle);
  return {
    materials: new DrizzleMaterialRepository(handle),
    patterns: new DrizzlePatternRepository(handle, tags),
    tags,
    crafts: new DrizzleCraftRepository(handle),
    events: new DrizzleEventRepository(handle),
  };
}

/** The app-wide bundle, bound to the default SQLite file. */
export const repositories: Repositories = createRepositories(db);

export {
  isLoginLocked,
  MAX_LOGIN_ATTEMPTS,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLoginLockout,
} from "./auth";
export { db, resolveDatabasePath } from "./client";
export type { DrizzleDb } from "./client";
export * from "./schema";
export { createId } from "./id";
export { DrizzleCraftRepository } from "./repositories/craft-repository";
export { DrizzleEventRepository } from "./repositories/event-repository";
export { DrizzleMaterialRepository } from "./repositories/material-repository";
export { DrizzlePatternRepository } from "./repositories/pattern-repository";
export { DrizzleTagRepository } from "./repositories/tag-repository";
