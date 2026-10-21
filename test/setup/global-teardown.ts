/**
 * Runs once after all e2e test files. Testcontainers' Ryuk sidecar would also
 * remove the container if the run crashed; stopping it here frees it right away.
 */
export default async function globalTeardown(): Promise<void> {
  await globalThis.__POSTGRES__?.stop();
}
