/**
 * Core type definitions and interfaces for the query builder.
 * This module defines metadata keys, configuration options, and type mappings.
 */

import type Database from 'better-sqlite3';

/**
 * Metadata keys for storing entity and column information.
 * Using Symbols prevents naming collisions in the metadata registry.
 */
export const TABLE_KEY = Symbol('table');
export const COLUMN_KEY = Symbol('column');
export const PRIMARY_KEY = Symbol('primary');

/**
 * Configuration options for DataSource initialization.
 * Mirrors TypeORM's DataSourceOptions for familiarity.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T;

/**
 * Configuration options for DataSource initialization.
 * Mirrors TypeORM's DataSourceOptions for familiarity.
 */
export interface DataSourceOptions {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Array of entity classes to register */
  entities: Constructor[];
  /** If true, auto-creates tables based on entity metadata */
  synchronize?: boolean;
  /** Logging level for SQL queries (for debugging) */
  logging?: boolean;
}

/**
 * Internal metadata for a column definition.
 * Stores the mapping between TypeScript properties and database columns.
 */
export interface ColumnMetadata {
  /** TypeScript property name */
  property: string | symbol;
  /** Database column name */
  column: string;
  /** TypeScript runtime type (e.g., String, Number, Boolean) */
  type?: Constructor;
  /** Whether this is the primary key */
  isPrimary?: boolean;
}

/**
 * Maps TypeScript runtime types to SQLite column types.
 * Used during schema synchronization and type validation.
 */
/**
 * Supported runtime types for column mapping.
 */
export type SupportedType =
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'Date'
  | 'Function'
  | 'Object';

/**
 * Maps TypeScript runtime types to SQLite column types.
 * Used during schema synchronization and type validation.
 */
export const TYPE_MAP: Record<SupportedType, string> = {
  String: 'TEXT',
  Number: 'INTEGER',
  Boolean: 'INTEGER',
  Date: 'TEXT',
  Function: 'TEXT',
  Object: 'TEXT',
};

/**
 * Converters for transforming values between TypeScript and SQLite.
 * - toDb: Prepares a value for storage (e.g., Boolean -> 0/1, Date -> ISO string)
 * - fromDb: Hydrates a value from storage (e.g., 0/1 -> Boolean, ISO string -> Date)
 */
export const VALUE_CONVERTERS: Partial<
  Record<
    SupportedType,
    { toDb: (v: unknown) => unknown; fromDb: (v: unknown) => unknown }
  >
> = {
  Boolean: {
    toDb: (v: unknown) => (v === true ? 1 : v === false ? 0 : v),
    fromDb: (v: unknown) => (v === 1 ? true : v === 0 ? false : Boolean(v)),
  },
  Date: {
    toDb: (v: unknown) => (v instanceof Date ? v.toISOString() : v),
    fromDb: (v: unknown) => (typeof v === 'string' ? new Date(v) : v),
  },
};

/**
 * Repository interface defining the contract for all data access operations.
 * Implements the CRUD operations required by the Data Mapper pattern.
 */
export interface IRepository<T extends object> {
  find(): T[];
  findBy(criteria: Partial<T>): T[];
  findOneBy(criteria: Partial<T>): T | undefined;
  findById(id: string | number): T | undefined;
  save(entity: T): Database.RunResult;
  update(criteria: Partial<T>, updates: Partial<T>): Database.RunResult;
  delete(criteria: Partial<T>): Database.RunResult;
  deleteById(id: string | number): Database.RunResult;
  count(): number;
}

/**
 * Transaction callback function.
 * Used in EntityManager.transaction() to wrap operations atomically.
 */
export type TransactionCallback<T> = (manager: IEntityManager) => T;

/**
 * EntityManager interface for managing transactions and entity operations.
 * Implements the Unit of Work pattern for atomic transactions.
 */
export interface IEntityManager {
  save<T extends object>(entity: T): Database.RunResult;
  transaction<T>(callback: TransactionCallback<T>): T;
  getRepository<T extends object>(entity: Constructor<T>): IRepository<T>;
}
