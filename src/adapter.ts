/**
 * SqliteAdapter: Thin abstraction over better-sqlite3
 *
 * This adapter mirrors Prisma's driver adapter pattern and provides
 * a clean interface for the ORM to interact with SQLite without
 * tight coupling to better-sqlite3 implementation details.
 *
 * Learning point: An adapter separates database concerns from business logic,
 * making it easier to test, mock, or swap implementations.
 */

import type Database from 'better-sqlite3';

/**
 * Configuration options for the SQLite adapter.
 */
export interface SqliteAdapterOptions {
  /** Path to the SQLite database file */
  filename: string;
  /** Enable verbose query logging for debugging */
  verbose?: boolean;
}

/**
 * SqliteAdapter: Wraps better-sqlite3 and provides a clean interface.
 *
 * Internal code should use the adapter, not better-sqlite3 directly.
 * This enables:
 * - Easy mocking in tests
 * - Potential future adapters (e.g., for different drivers)
 * - Clear separation of concerns
 */
export class SqliteAdapter {
  private db: Database.Database;

  constructor(options: SqliteAdapterOptions) {
    // Import dynamically to avoid forcing better-sqlite3 as a peer dependency in type checking
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3').default;
    this.db = new Database(options.filename);

    if (options.verbose) {
      this.db.pragma('journal_mode = WAL');
    }
  }

  /**
   * Prepare and return a statement for execution.
   *
   * @param sql - SQL query string
   * @returns A prepared statement
   */
  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  /**
   * Execute a function within a transaction.
   *
   * If the function throws, the transaction is rolled back.
   * If it succeeds, changes are committed.
   *
   * @param fn - Function to execute within a transaction
   * @returns The return value of fn
   */
  transaction<T>(fn: () => T): T {
    const trx = this.db.transaction(fn);
    return trx();
  }

  /**
   * Check if a table exists in the database.
   *
   * @param tableName - Name of the table to check
   * @returns true if table exists, false otherwise
   */
  tableExists(tableName: string): boolean {
    const result = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
      )
      .get(tableName);
    return !!result;
  }

  /**
   * Close the database connection.
   * After calling this, no further operations are possible.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the underlying better-sqlite3 database instance.
   *
   * WARNING: Exposed for advanced use only. Prefer using adapter methods.
   *
   * @internal
   */
  getDb(): Database.Database {
    return this.db;
  }
}
