import type { EntityMetadata } from "./types.ts";

/**
 * Creates a type predicate that validates a value matches entity shape.
 * Ensures safe deserialization at I/O boundaries.
 * @example
 *   const isUser = createEntityGuard(userMeta);
 *   if (isUser(row)) { // TS proves row is User }
 */
export function createEntityGuard<T>(meta: EntityMetadata) {
  return (data: unknown): data is T => {
    // Must be object
    if (typeof data !== "object" || data === null) return false;

    const obj = data as Record<string, unknown>;

    // All columns must exist and pass type check
    for (const col of meta.columns) {
      if (!(col.name in obj)) return false;

      const value = obj[col.name];
      if (!isValidType(value, col.type)) return false;
    }

    return true;
  };
}

/**
 * Runtime type check for common TS types.
 * Validates SQLite scalar types map back to expected TypeScript types.
 */
function isValidType(value: unknown, tsType: string): boolean {
  // Allow null/undefined
  if (value === null || value === undefined) return true;

  switch (tsType) {
    case "number":
      return typeof value === "number";
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean" || typeof value === "number";
    case "Date":
      return value instanceof Date || typeof value === "string";
    default:
      return true; // Unknown types pass (be permissive)
  }
}

/**
 * Assert data is entity type or throw.
 * Useful for strict validation with immediate error feedback.
 */
export function assertEntity<T>(
  data: unknown,
  meta: EntityMetadata,
  label: string
): asserts data is T {
  const guard = createEntityGuard<T>(meta);
  if (!guard(data)) {
    throw new Error(
      `${label}: Invalid entity shape. Expected columns: ${meta.columns.map((c) => c.name).join(", ")}`
    );
  }
}
