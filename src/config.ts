/**
 * Configuration helpers for the ORM.
 *
 * Pattern: Inspired by Prisma's config pattern
 * - defineConfig(): Helper to define DataSource options with type safety
 * - env(): Type-safe environment variable access with validation
 *
 * Philosophy: Explicit over implicit. The ORM doesn't load .env automatically.
 * Users should:
 *   import 'dotenv/config' // at top of config file
 *   or use: node --env-file=.env src/main.ts
 */

import type { DataSourceOptions } from './types';

/**
 * Helper to define data source configuration with type safety.
 *
 * Matches Prisma's approach: returns the options object unchanged,
 * but TypeScript provides autocomplete and type checking.
 *
 * @example
 * ```typescript
 * import { defineConfig, env } from 'query-builder-wrapper'
 *
 * export default defineConfig({
 *   dbPath: env('DATABASE_URL'),
 *   entities: [User, Product],
 *   synchronize: true,
 *   logging: process.env.NODE_ENV === 'development',
 * })
 * ```
 *
 * @param options - DataSource configuration options
 * @returns The same options object (unchanged)
 */
export function defineConfig(options: DataSourceOptions): DataSourceOptions {
  validateConfig(options);
  return options;
}

/**
 * Type-safe environment variable accessor.
 *
 * Throws if the variable is not set, ensuring you catch
 * configuration errors early at startup.
 *
 * @example
 * ```typescript
 * const dbPath = env('DATABASE_URL') // throws if not set
 * const logLevel = env('LOG_LEVEL', 'info') // defaults to 'info'
 * ```
 *
 * @param name - Environment variable name
 * @param defaultValue - Optional default if variable is not set
 * @returns The environment variable value
 * @throws Error if variable is not set and no default provided
 */
export function env(name: string, defaultValue?: string): string {
  const value = process.env[name];

  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Please set ${name} or provide a default in your config.`,
    );
  }

  return value;
}

/**
 * Validate DataSourceOptions to catch common configuration errors early.
 *
 * @internal
 */
function validateConfig(options: DataSourceOptions): void {
  if (!options.dbPath) {
    throw new Error(
      'DataSourceOptions.dbPath is required. \n' +
        'Example: { dbPath: "app.db", entities: [User] }',
    );
  }

  if (!options.entities || options.entities.length === 0) {
    throw new Error(
      'DataSourceOptions.entities is required and must not be empty. \n' +
        'Example: { dbPath: "app.db", entities: [User, Product] }',
    );
  }
}
