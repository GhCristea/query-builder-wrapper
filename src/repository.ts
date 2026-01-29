/**
 * Repository implements the Data Mapper pattern for entity persistence.
 *
 * The repository reads metadata decorators to dynamically map objects to SQL
 * via the SqliteCompiler and SqliteAdapter. This keeps domain entities
 * (User, Post, etc.) free of database logic.
 *
 * Key responsibility: Translate between TypeScript objects and SQL queries.
 */

import type Database from "better-sqlite3";
import type { ColumnMetadata, IRepository, SupportedType, Constructor } from "./types.ts";
import {
  getTableName,
  getColumnMetadata,
  getPrimaryKey,
} from "./decorators.ts";
import { SqliteCompiler, SqliteAdapter } from "./sqlite-dialect.ts";
import { createEntityGuard } from "./type-guards.ts";
import { VALUE_CONVERTERS } from "./types.ts";

export class Repository<T extends object> implements IRepository<T> {
  private tableName: string;
  private columns: ColumnMetadata[];
  private primaryKey: string | symbol | undefined;
  private compiler = new SqliteCompiler();
  private adapter = new SqliteAdapter();
  private guardEntity: (data: unknown) => data is T;

  constructor(
    private entity: Constructor<T>,
    private db: Database.Database
  ) {
    this.tableName = getTableName(entity);
    this.columns = getColumnMetadata(entity);
    this.primaryKey = getPrimaryKey(entity);
    this.guardEntity = createEntityGuard({
      tableName: this.tableName,
      columns: this.columns.map((c) => ({
        name: c.column,
        type: c.type?.name || "string",
        isPrimary: false,
      })),
    });
  }

  find(): T[] {
    const { sql, params } = this.compiler.compileSelect({
      tableName: this.tableName,
      columns: this.columns.map((c) => ({
        name: c.column,
        type: c.type?.name || "string",
        isPrimary: false,
      })),
    });
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRowToEntity(row));
  }

  findBy(criteria: Partial<T>): T[] {
    if (Object.keys(criteria).length === 0) {
      return this.find();
    }
    const criteriaObj = this.normalizeCriteria(criteria);
    const { sql, params } = this.compiler.compileSelect(
      {
        tableName: this.tableName,
        columns: this.columns.map((c) => ({
          name: c.column,
          type: c.type?.name || "string",
          isPrimary: false,
        })),
      },
      criteriaObj
    );
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRowToEntity(row));
  }

  findOneBy(criteria: Partial<T>): T | undefined {
    const criteriaObj = this.normalizeCriteria(criteria);
    const { sql, params } = this.compiler.compileSelect(
      {
        tableName: this.tableName,
        columns: this.columns.map((c) => ({
          name: c.column,
          type: c.type?.name || "string",
          isPrimary: false,
        })),
      },
      criteriaObj
    );
    const row = this.db.prepare(`${sql} LIMIT 1`).get(...params) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const entity = this.mapRowToEntity(row);
    if (!this.guardEntity(entity)) {
      throw new Error("Invalid entity shape from database");
    }
    return entity;
  }

  findById(id: string | number): T | undefined {
    if (!this.primaryKey) {
      throw new Error(`Entity ${this.entity.name} has no primary key defined.`);
    }
    const pkColumn = this.getColumnName(String(this.primaryKey));
    return this.findOneBy({ [String(this.primaryKey)]: id } as Partial<T>);
  }

  /**
   * Insert or replace an entity (UPSERT).
   * Uses SQLite's INSERT OR REPLACE strategy for idempotence.
   */
  save(entity: T): Database.RunResult {
    if (!this.guardEntity(entity)) {
      throw new Error("Entity does not match expected shape");
    }
    const values = this.columns.map((c) =>
      this.toDbValue(
        c,
        (entity as Record<string, unknown>)[String(c.property)]
      )
    );
    const sql = this.compiler.compileInsert({
      tableName: this.tableName,
      columns: this.columns.map((c) => ({
        name: c.column,
        type: c.type?.name || "string",
        isPrimary: c.property === this.primaryKey,
      })),
    });
    return this.db.prepare(sql).run(...values);
  }

  update(criteria: Partial<T>, updates: Partial<T>): Database.RunResult {
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      throw new Error("update() requires at least one field to update");
    }

    const criteriaObj = this.normalizeCriteria(criteria);
    const updatesObj = this.normalizeCriteria(updates);

    // Build SET clause from updates
    const setClauses = updateKeys
      .map((key) => `"${this.getColumnName(key)}" = ?`)
      .join(", ");
    const updateValues = updateKeys.map((key) => {
      const column = this.columns.find((c) => c.property === key);
      return this.toDbValue(
        column,
        (updates as Record<string, unknown>)[key]
      );
    });

    // Build WHERE clause from criteria
    const whereClause = Object.keys(criteriaObj)
      .map((k) => `"${k}" = ?`)
      .join(" AND ");
    const whereValues = Object.values(criteriaObj);

    const sql = `UPDATE "${this.tableName}" SET ${setClauses} WHERE ${whereClause}`;
    return this.db.prepare(sql).run(...updateValues, ...whereValues);
  }

  delete(criteria: Partial<T>): Database.RunResult {
    const criteriaObj = this.normalizeCriteria(criteria);
    const { sql, params } = this.compiler.compileDelete(
      {
        tableName: this.tableName,
        columns: this.columns.map((c) => ({
          name: c.column,
          type: c.type?.name || "string",
          isPrimary: false,
        })),
      },
      criteriaObj
    );
    return this.db.prepare(sql).run(...params);
  }

  deleteById(id: string | number): Database.RunResult {
    if (!this.primaryKey) {
      throw new Error(`Entity ${this.entity.name} has no primary key defined.`);
    }
    return this.delete({ [String(this.primaryKey)]: id } as Partial<T>);
  }

  count(): number {
    const sql = this.compiler.compileCount({
      tableName: this.tableName,
      columns: this.columns.map((c) => ({
        name: c.column,
        type: c.type?.name || "string",
        isPrimary: false,
      })),
    });
    const result = this.db.prepare(sql).get() as { count: number };
    return result.count;
  }

  /**
   * Map a database row to an entity instance with type safety.
   * @private
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
   * @private
   */
  private getColumnName(prop: string): string {
    const col = this.columns.find((c) => c.property === prop);
    return col?.column || prop;
  }

  /**
   * Normalize criteria by mapping property names to column names.
   * @private
   */
  private normalizeCriteria(criteria: Partial<T>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(criteria)) {
      const colName = this.getColumnName(key);
      result[colName] = this.toDbValue(
        this.columns.find((c) => c.property === key),
        value
      );
    }
    return result;
  }

  /**
   * Normalize values before binding to better-sqlite3.
   * Uses VALUE_CONVERTERS from types.ts
   */
  private toDbValue<V>(
    column: ColumnMetadata | undefined,
    value: V
  ): unknown {
    if (value == null || !column || !column.type) {
      return value;
    }
    const typeName = column.type.name as SupportedType;
    const converter = VALUE_CONVERTERS[typeName];
    return converter ? converter.toDb(value) : value;
  }

  /**
   * Hydrate values from better-sqlite3 back to TypeScript types.
   * Uses VALUE_CONVERTERS from types.ts
   */
  private fromDbValue(
    column: ColumnMetadata | undefined,
    value: unknown
  ): unknown {
    if (value == null || !column || !column.type) {
      return value;
    }
    const typeName = column.type.name as SupportedType;
    const converter = VALUE_CONVERTERS[typeName];
    return converter ? converter.fromDb(value) : value;
  }
}
