/**
 * DataSource is the primary orchestrator for the ORM.
 *
 * Responsibilities:
 * 1. Manages the better-sqlite3 database connection
 * 2. Provides lazy initialization (connection only on .initialize())
 * 3. Optional schema synchronization (auto-create tables)
 * 4. Dispenses EntityManagers and Repositories
 *
 * This pattern mirrors TypeORM's DataSource and implements the dependency
 * injection / service locator pattern for a clean API.
 */

import Database from "better-sqlite3";
import { DataSourceOptions, TYPE_MAP } from "./types";
import { EntityManager } from "./entity-manager";
import { Repository } from "./repository";
import { getTableName, getColumnMetadata } from "./decorators";

export class DataSource {
  public manager: EntityManager;
  private db: Database.Database | null = null;
  private isInitialized: boolean = false;
  private options: DataSourceOptions;

  constructor(options: DataSourceOptions) {
    this.options = {
      synchronize: false,
      logging: false,
      ...options,
    };

    // Initialize manager with a null db (will be injected in initialize())
    this.manager = new EntityManager(null as any);
  }

  /**
   * Initialize the data source.
   * Opens the database connection and optionally creates tables.
   *
   * Must be called before using any repositories or queries.
   * Safe to call multiple times (idempotent).
   *
   * @returns this (for chaining)
   *
   * @example
   * ```typescript
   * const dataSource = new DataSource({
   *   dbPath: "app.db",
   *   entities: [User, Profile],
   *   synchronize: true,
   * });
   *
   * await dataSource.initialize();
   * const userRepo = dataSource.getRepository(User);
   * ```
   */
  async initialize(): Promise<this> {
    if (this.isInitialized) {
      return this;
    }

    try {
      // 1. Open the better-sqlite3 connection
      this.db = new Database(this.options.dbPath);

      if (this.options.logging) {
        console.log(`[DataSource] Connected to ${this.options.dbPath}`);
      }

      // 2. Inject the db into the manager
      (this.manager as any).db = this.db;

      // 3. Optional: Synchronize schema
      if (this.options.synchronize) {
        this.synchronizeSchema();
        if (this.options.logging) {
          console.log(`[DataSource] Schema synchronized`);
        }
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize DataSource: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return this;
  }

  /**
   * Get a Repository for an entity type.
   * Delegates to the EntityManager which caches repositories.
   *
   * @param entity - The entity class
   * @returns Typed Repository instance
   *
   * @example
   * ```typescript
   * const userRepository = dataSource.getRepository(User);
   * const users = userRepository.find();
   * ```
   */
  getRepository<T extends object>(entity: new () => T): Repository<T> {
    if (!this.isInitialized) {
      throw new Error(
        "DataSource not initialized. Call .initialize() first."
      );
    }
    return this.manager.getRepository(entity);
  }

  /**
   * Destroy the connection gracefully.
   * Closes the database connection and resets state.
   *
   * @example
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   await dataSource.destroy();
   *   process.exit(0);
   * });
   * ```
   */
  async destroy(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;

      if (this.options.logging) {
        console.log(`[DataSource] Connection closed`);
      }
    }
  }

  /**
   * Check if the data source is initialized.
   *
   * @returns true if initialized, false otherwise
   */
  isInitialized_check(): boolean {
    return this.isInitialized;
  }

  /**
   * Synchronize the schema based on entity metadata.
   * Creates tables if they don't exist.
   *
   * IMPORTANT: This is simplified and intended for learning.
   * For production, use proper migration tools.
   *
   * @private
   */
  private synchronizeSchema(): void {
    if (!this.db) {
      throw new Error("Database not connected");
    }

    this.options.entities.forEach((entity) => {
      try {
        const tableName = getTableName(entity);
        const columns = getColumnMetadata(entity);

        // Build column definitions
        const columnDefs = columns
          .map((col) => {
            const sqlType = TYPE_MAP[col.type?.name || "String"] || "TEXT";
            const constraints = col.isPrimary
              ? "PRIMARY KEY AUTOINCREMENT"
              : "";
            return `${col.column} ${sqlType} ${constraints}`.trim();
          })
          .join(", ");

        const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`;
        this.db!.prepare(sql).run();

        if (this.options.logging) {
          console.log(`[DataSource] Created table: ${tableName}`);
        }
      } catch (error) {
        if (this.options.logging) {
          console.error(
            `[DataSource] Error syncing ${entity.name}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    });
  }
}
