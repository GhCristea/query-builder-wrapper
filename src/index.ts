/**
 * query-builder-wrapper: A lightweight Data Mapper ORM for better-sqlite3
 *
 * This module provides TypeScript decorators and a query builder that
 * abstracts away SQLite while keeping your entities pure domain objects.
 *
 * Core concepts:
 * - Decorators: @Entity, @Column for metadata definition
 * - Repository: Data Mapper for CRUD operations
 * - EntityManager: Unit of Work for transactions
 * - DataSource: Orchestrator for connection and schema management
 *
 * @example
 * ```typescript
 * // 1. Define entities
 * @Entity("users")
 * class User {
 *   @Column("user_id", true)
 *   id: number;
 *
 *   @Column()
 *   username: string;
 * }
 *
 * // 2. Initialize DataSource
 * const dataSource = new DataSource({
 *   dbPath: "app.db",
 *   entities: [User],
 *   synchronize: true,
 * });
 *
 * await dataSource.initialize();
 *
 * // 3. Use Repository
 * const userRepo = dataSource.getRepository(User);
 * const user = new User();
 * user.id = 1;
 * user.username = "alice";
 * userRepo.save(user);
 *
 * const found = userRepo.findOneBy({ id: 1 });
 * ```
 */

// Decorators
export { Entity, Column } from './decorators';
export { getTableName, getColumnMetadata, getPrimaryKey } from './decorators';

// Repository
export { Repository } from './repository';

// Entity Manager
export { EntityManager } from './entity-manager';

// Data Source
export { DataSource, defineConfig } from './data-source';

// Types
export type {
  DataSourceOptions,
  ColumnMetadata,
  IRepository,
  IEntityManager,
  TransactionCallback,
} from './types';

export { TABLE_KEY, COLUMN_KEY, PRIMARY_KEY } from './types';
