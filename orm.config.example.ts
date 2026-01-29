/**
 * orm.config.example.ts
 *
 * Example configuration file using the new config pattern.
 *
 * Usage:
 *   1. Copy this file to orm.config.ts in your project root
 *   2. Update entities and database path
 *   3. Import in your main entry point or load via Node's --env-file flag
 *
 * Pattern: Inspired by Prisma's config approach.
 * Philosophy: Explicit over implicit. You control environment loading.
 */

// Load environment variables if they're in a .env file
// You can use:
//   - import 'dotenv/config'  // from npm dotenv
//   - node --env-file=.env     // built-in Node.js feature (18.20+)
//   - Bun loads .env automatically
// import 'dotenv/config'

import { defineConfig, env } from 'query-builder-wrapper';
// import { User, Product } from './src/entities' // your entities

export default defineConfig({
  // Database path: file path for SQLite
  // Can be ':memory:' for in-memory testing
  dbPath: env('DATABASE_URL', 'file:./app.db'),

  // Entities: all models your app uses
  // Import and add your entity classes here
  entities: [
    // User,
    // Product,
    // Add your entities here
  ],

  // Auto-create tables on initialization
  // Useful for development; disable in production and use migrations instead
  synchronize: process.env.NODE_ENV !== 'production',

  // Log SQL operations for debugging
  logging: process.env.NODE_ENV === 'development',
});

/**
 * Environment Variables
 *
 * DATABASE_URL: Path to SQLite database
 *   Default: file:./app.db
 *   Examples:
 *     - file:./dev.db (development)
 *     - file:./test.db (testing)
 *     - :memory: (in-memory, useful for tests)
 *
 * NODE_ENV: Current environment
 *   Values: development, test, production
 *   Controls logging and schema synchronization
 */
