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

import Database from 'better-sqlite3';
import {
  DataSourceOptions,
  TYPE_MAP,
  Constructor,
  SupportedType,
} from './types';
import { EntityManager } from './entity-manager';
import { Repository } from './repository';
import { getTableName, getColumnMetadata } from './decorators';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.manager = new EntityManager(null as any);
  }

  /**
   * Static factory method for initializing DataSource in one call.
   *
   * Convenience for quick setup or testing.
   *
   * @example
   * ```typescript
   * const dataSource = await DataSource.init({
   *   dbPath: 'app.db',
   *   entities: [User],
   *   synchronize: true,
   * })
   * ```
   */
  static async init(options: DataSourceOptions): Promise<DataSource> {
    const dataSource = new DataSource(options);
    await dataSource.initialize();
    return dataSource;
  }

  /**
   * Initialize the DataSource: open database connection and sync schema if needed.
   *
   * Must be called before using getRepository() or any operations.
   *
   * @throws Error if initialization fails
   * @returns this (allows method chaining)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        `Failed to initialize DataSource: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this;
  }

  /**
   * Get a Repository for a given entity.
   *
   * The repository provides type-safe CRUD operations.
   *
   * @example
   * ```typescript
   * const userRepo = dataSource.getRepository(User)
   * const user = userRepo.findOneBy({ id: 1 })
   * ```
   *
   * @throws Error if DataSource is not initialized
   */
  getRepository<T extends object>(entity: Constructor<T>): Repository<T> {
    if (!this.isInitialized) {
      throw new Error('DataSource not initialized. Call .initialize() first.');
    }
    return this.manager.getRepository(entity);
  }

  /**
   * Close the database connection and clean up resources.
   *
   * After calling this, the DataSource must be reinitialized to use again.
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
      throw new Error('Database not connected');
    }

    this.options.entities.forEach((entity) => {
      try {
        const tableName = getTableName(entity);
        const columns = getColumnMetadata(entity);

        // Build column definitions
        const columnDefs = columns
          .map((col) => {
            const sqlType =
              TYPE_MAP[(col.type?.name || 'String') as SupportedType] || 'TEXT';
            const constraints = col.isPrimary
              ? 'PRIMARY KEY AUTOINCREMENT'
              : '';
            return `${col.column} ${sqlType} ${constraints}`.trim();
          })
          .join(', ');

        const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`;
        this.db!.prepare(sql).run();

        if (this.options.logging) {
          console.log(`[DataSource] Created table: ${tableName}`);
        }
      } catch (error) {
        if (this.options.logging) {
          console.error(
            `[DataSource] Error syncing ${entity.name}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    });
  }
}
