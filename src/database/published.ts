import { Raw } from 'typeorm';

/**
 * `where` operator for "published": has a publish date that has passed, by
 * the database clock (one clock for every API instance). No `IS NOT NULL`
 * needed: `NULL <= now()` is not true, so drafts drop out on their own.
 */
export const isPublishedNow = () => Raw((column) => `${column} <= now()`);
