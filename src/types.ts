/**
 * Core type definitions and interfaces for the query builder.
 * This module defines metadata keys, configuration options, and type mappings.
 */

import type Database from "better-sqlite3";

/**
 * Metadata keys for storing entity and column information.
 * Using Symbols prevents naming collisions in the metadata registry.
 */
export const TABLE_KEY = Symbol("table");
export const COLUMN_KEY = Symbol("column");
export const PRIMARY_KEY = Symbol("primary");

/**
 * Configuration options for DataSource initialization.
 * Mirrors TypeORM's DataSourceOptions for familiarity.
 */
export interface DataSourceOptions {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Array of entity classes to register */
  entities: Function[];
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
  type?: Function;
  /** Whether this is the primary key */
  isPrimary?: boolean;
}

/**
 * Maps TypeScript runtime types to SQLite column types.
 * Used during schema synchronization and type validation.
 */
export const TYPE_MAP: Record<string, string> = {
  String: "TEXT",
  Number: "INTEGER",
  Boolean: "INTEGER",
  Date: "TEXT",
  Function: "TEXT",
  Object: "TEXT",
};

/**
 * Repository interface defining the contract for all data access operations.
 * Implements the CRUD operations required by the Data Mapper pattern.
 */
export interface IRepository<T extends object> {
  find(): T[];
  findBy(criteria: Partial<T>): T[];
  findOneBy(criteria: Partial<T>): T | undefined;
  save(entity: T): Database.RunResult;
  update(criteria: Partial<T>, updates: Partial<T>): Database.RunResult;
  delete(criteria: Partial<T>): Database.RunResult;
  count(): number;
}

/**
 * Transaction callback function.
 * Used in EntityManager.transaction() to wrap operations atomically.
 */
export type TransactionCallback<T> = (manager: EntityManager) => T;

/**
 * EntityManager interface for managing transactions and entity operations.
 * Implements the Unit of Work pattern for atomic transactions.
 */
export interface IEntityManager {
  save<T extends object>(entity: T): Database.RunResult;
  transaction<T>(callback: TransactionCallback<T>): T;
}
