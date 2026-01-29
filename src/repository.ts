/**
 * Repository implements the Data Mapper pattern for entity persistence.
 *
 * The repository reads metadata decorators to dynamically generate SQL and map
 * database rows back to TypeScript entity instances. This keeps your domain
 * entities (User, Post, etc.) free of database logic.
 *
 * Key responsibility: Translate between TypeScript objects and SQL queries.
 */

import type Database from 'better-sqlite3';
import {
  ColumnMetadata,
  IRepository,
  VALUE_CONVERTERS,
  SupportedType,
  Constructor,
} from './types';
import { getTableName, getColumnMetadata, getPrimaryKey } from './decorators';

export class Repository<T extends object> implements IRepository<T> {
  private tableName: string;
  private columns: ColumnMetadata[];
  private primaryKey: string | symbol | undefined;

  constructor(
    private entity: Constructor<T>,
    private db: Database.Database,
  ) {
    this.tableName = getTableName(entity);
    this.columns = getColumnMetadata(entity);
    this.primaryKey = getPrimaryKey(entity);
  }

  find(): T[] {
    const sql = `SELECT * FROM ${this.tableName}`;
    const rows = this.db.prepare(sql).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRowToEntity(row));
  }

  findBy(criteria: Partial<T>): T[] {
    if (Object.keys(criteria).length === 0) {
      return this.find();
    }

    const { where, values } = this.buildWhere(criteria);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${where}`;
    const rows = this.db.prepare(sql).all(...values) as Array<
      Record<string, unknown>
    >;
    return rows.map((row) => this.mapRowToEntity(row));
  }

  findOneBy(criteria: Partial<T>): T | undefined {
    const { where, values } = this.buildWhere(criteria);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${where} LIMIT 1`;
    const row = this.db.prepare(sql).get(...values) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapRowToEntity(row) : undefined;
  }

  findById(id: string | number): T | undefined {
    if (!this.primaryKey) {
      throw new Error(`Entity ${this.entity.name} has no primary key defined.`);
    }
    const pkColumn = this.getColumnName(String(this.primaryKey));
    const sql = `SELECT * FROM ${this.tableName} WHERE ${pkColumn} = ? LIMIT 1`;
    const row = this.db.prepare(sql).get(id) as
      | Record<string, unknown>
      | undefined;
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
    const keys = this.columns.map((c) => c.column).join(', ');
    const placeholders = this.columns.map(() => '?').join(', ');
    const values = this.columns.map((c) =>
      this.toDbValue(
        c,
        (entity as Record<string, unknown>)[String(c.property)],
      ),
    );

    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${keys}) VALUES (${placeholders})`;
    return this.db.prepare(sql).run(...values);
  }

  update(criteria: Partial<T>, updates: Partial<T>): Database.RunResult {
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      throw new Error('update() requires at least one field to update');
    }

    const setClauses = updateKeys
      .map((key) => `${this.getColumnName(key)} = ?`)
      .join(', ');
    const updateValues = updateKeys.map((key) => {
      const column = this.columns.find((c) => c.property === key);
      return this.toDbValue(column, (updates as Record<string, unknown>)[key]);
    });

    const { where, values: whereValues } = this.buildWhere(criteria);
    const sql = `UPDATE ${this.tableName} SET ${setClauses} WHERE ${where}`;

    return this.db.prepare(sql).run(...updateValues, ...whereValues);
  }

  delete(criteria: Partial<T>): Database.RunResult {
    const { where, values } = this.buildWhere(criteria);
    const sql = `DELETE FROM ${this.tableName} WHERE ${where}`;
    return this.db.prepare(sql).run(...values);
  }

  deleteById(id: string | number): Database.RunResult {
    if (!this.primaryKey) {
      throw new Error(`Entity ${this.entity.name} has no primary key defined.`);
    }
    const pkColumn = this.getColumnName(String(this.primaryKey));
    const sql = `DELETE FROM ${this.tableName} WHERE ${pkColumn} = ?`;
    return this.db.prepare(sql).run(id);
  }

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
  private mapRowToEntity(row: Record<string, unknown>): T {
    const instance = new this.entity();
    this.columns.forEach((col) => {
      const rawValue = row[col.column];
      (instance as Record<string, unknown>)[String(col.property)] =
        this.fromDbValue(col, rawValue);
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
  private buildWhere(criteria: Partial<T>): {
    where: string;
    values: unknown[];
  } {
    const keys = Object.keys(criteria);
    const whereClauses = keys.map((key) => `${this.getColumnName(key)} = ?`);
    const values = keys.map((key) => {
      const column = this.columns.find((c) => c.property === key);
      return this.toDbValue(column, (criteria as Record<string, unknown>)[key]);
    });

    return {
      where: whereClauses.join(' AND '),
      values,
    };
  }

  /**
  /**
   * Normalize values before binding to better-sqlite3.
   * - Uses VALUE_CONVERTERS from types.ts
   */
  private toDbValue<V>(column: ColumnMetadata | undefined, value: V): unknown {
    if (value == null || !column || !column.type) {
      return value;
    }

    const typeName = column.type.name as SupportedType;
    const converter = VALUE_CONVERTERS[typeName];
    return converter ? converter.toDb(value) : value;
  }

  /**
   * Hydrate values from better-sqlite3 back to TypeScript types.
   * - Uses VALUE_CONVERTERS from types.ts
   */
  private fromDbValue(
    column: ColumnMetadata | undefined,
    value: unknown,
  ): unknown {
    if (value == null || !column || !column.type) {
      return value;
    }

    const typeName = column.type.name as SupportedType;
    const converter = VALUE_CONVERTERS[typeName];
    return converter ? converter.fromDb(value) : value;
  }
}
