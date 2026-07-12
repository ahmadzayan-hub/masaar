// Tiny env accessor shared across provider wrappers (AI, notifications, sheets).
// Keeps a single, greppable place for reading process.env.
export function env(key: string): string | undefined {
  return process.env[key];
}
