/**
 * Repository implements the Data Mapper pattern for entity persistence.
 *
 * The repository reads metadata decorators to dynamically generate SQL and map
 * database rows back to TypeScript entity instances. This keeps your domain
 * entities (User, Post, etc.) free of database logic.
 *
 * Key responsibility: Translate between TypeScript objects and SQL queries.
 */

import type Database from "better-sqlite3";
import {
  ColumnMetadata,
  IRepository,
  TYPE_MAP,
  COLUMN_KEY,
  TABLE_KEY,
} from "./types";
import {
  getTableName,
  getColumnMetadata,
  getPrimaryKey,
} from "./decorators";

export class Repository<T extends object> implements IRepository<T> {
  private tableName: string;
  private columns: ColumnMetadata[];
  private primaryKey: string | symbol | undefined;

  constructor(private entity: new () => T, private db: Database.Database) {
    this.tableName = getTableName(entity);
    this.columns = getColumnMetadata(entity);
    this.primaryKey = getPrimaryKey(entity);
  }

  /**
   * Find all records in the table.
   * Maps each database row to an entity instance.
   *
   * @returns Array of entity instances
   *
   * @example
   * ```typescript
   * const users = userRepository.find();
   * ```
   */
  find(): T[] {
    const sql = `SELECT * FROM ${this.tableName}`;
    const rows = this.db.prepare(sql).all() as Array<Record<string, any>>;
    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find records matching criteria.
   * Supports multiple WHERE conditions (AND logic).
   *
   * @param criteria - Object with property names matching entity fields
   * @returns Array of matching entity instances
   *
   * @example
   * ```typescript
   * const activeUsers = userRepository.findBy({ isActive: true });
   * const byRole = userRepository.findBy({ role: 'admin' });
   * ```
   */
  findBy(criteria: Partial<T>): T[] {
    if (Object.keys(criteria).length === 0) {
      return this.find();
    }

    const { where, values } = this.buildWhere(criteria);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${where}`;
    const rows = this.db.prepare(sql).all(...values) as Array<
      Record<string, any>
    >;
    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Find a single record matching criteria.
   * Returns the first match or undefined if no match found.
   *
   * @param criteria - Object with property names matching entity fields
   * @returns Single entity instance or undefined
   *
   * @example
   * ```typescript
   * const user = await userRepository.findOneBy({ id: 1 });
   * if (user) console.log(user.username);
   * ```
   */
  findOneBy(criteria: Partial<T>): T | undefined {
    const { where, values } = this.buildWhere(criteria);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${where} LIMIT 1`;
    const row = this.db.prepare(sql).get(...values) as Record<string, any> | undefined;
    return row ? this.mapRowToEntity(row) : undefined;
  }

  /**
   * Insert or replace an entity (UPSERT).
   * Uses SQLite's INSERT OR REPLACE strategy for idempotence.
   *
   * @param entity - The entity instance to save
   * @returns Result with lastID and changes count
   *
   * @example
   * ```typescript
   * const user = new User();
   * user.id = 1;
   * user.username = "alice";
   * userRepository.save(user);
   * ```
   */
  save(entity: T): Database.RunResult {
    const keys = this.columns.map((c) => c.column).join(", ");
    const placeholders = this.columns.map(() => "?").join(", ");
    const values = this.columns.map((c) => (entity as any)[c.property]);

    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${keys}) VALUES (${placeholders})`;
    return this.db.prepare(sql).run(...values);
  }

  /**
   * Update records matching criteria.
   * Sets the specified fields on all matching records.
   *
   * @param criteria - WHERE clause conditions
   * @param updates - Fields to update
   * @returns Result with changes count
   *
   * @example
   * ```typescript
   * userRepository.update({ id: 1 }, { username: "bob" });
   * ```
   */
  update(criteria: Partial<T>, updates: Partial<T>): Database.RunResult {
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      throw new Error("update() requires at least one field to update");
    }

    const setClauses = updateKeys
      .map((key) => `${this.getColumnName(key)} = ?`)
      .join(", ");
    const updateValues = updateKeys.map((key) => (updates as any)[key]);

    const { where, values: whereValues } = this.buildWhere(criteria);
    const sql = `UPDATE ${this.tableName} SET ${setClauses} WHERE ${where}`;

    return this.db.prepare(sql).run(...updateValues, ...whereValues);
  }

  /**
   * Delete records matching criteria.
   * Supports multiple WHERE conditions (AND logic).
   *
   * @param criteria - WHERE clause conditions
   * @returns Result with changes count
   *
   * @example
   * ```typescript
   * userRepository.delete({ id: 1 });
   * userRepository.delete({ isActive: false });
   * ```
   */
  delete(criteria: Partial<T>): Database.RunResult {
    const { where, values } = this.buildWhere(criteria);
    const sql = `DELETE FROM ${this.tableName} WHERE ${where}`;
    return this.db.prepare(sql).run(...values);
  }

  /**
   * Count records in the table.
   *
   * @returns Total record count
   *
   * @example
   * ```typescript
   * const total = userRepository.count();
   * ```
   */
  count(): number {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const result = this.db.prepare(sql).get() as { count: number };
    return result.count;
  }

  /**
   * Map a database row to an entity instance.
   * Iterates through column metadata and assigns values from the row.
   *
   * @private
   * @param row - Raw database row
   * @returns Entity instance with values from row
   */
  private mapRowToEntity(row: Record<string, any>): T {
    const instance = new this.entity();
    this.columns.forEach((col) => {
      (instance as any)[col.property] = row[col.column];
    });
    return instance;
  }

  /**
   * Get the database column name for a property.
   * Looks up the mapping defined in @Column decorators.
   *
   * @private
   * @param prop - TypeScript property name
   * @returns Database column name
   */
  private getColumnName(prop: string): string {
    const col = this.columns.find((c) => c.property === prop);
    return col?.column || prop;
  }

  /**
   * Build a WHERE clause from criteria object.
   * Handles multiple conditions with AND logic.
   *
   * @private
   * @param criteria - Object with conditions
   * @returns { where: string, values: any[] }
   */
  private buildWhere(
    criteria: Partial<T>
  ): { where: string; values: any[] } {
    const keys = Object.keys(criteria);
    const whereClauses = keys.map(
      (key) => `${this.getColumnName(key)} = ?`
    );
    const values = keys.map((key) => (criteria as any)[key]);

    return {
      where: whereClauses.join(" AND "),
      values,
    };
  }
}
