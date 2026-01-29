import type { EntityMetadata } from "./types.ts";

/**
 * Compiles entity metadata to SQLite SQL strings.
 * Encapsulates all SQL generation logic.
 */
export class SqliteCompiler {
  compileCreate(meta: EntityMetadata): string {
    const columns = meta.columns
      .map((col) => {
        let def = `"${col.name}" ${this.toSqlType(col.type)}`;
        if (col.isPrimary) def += " PRIMARY KEY";
        return def;
      })
      .join(", ");
    return `CREATE TABLE IF NOT EXISTS "${meta.tableName}" (${columns})`;
  }

  compileInsert(meta: EntityMetadata): string {
    const cols = meta.columns.map((c) => `"${c.name}"`).join(", ");
    const placeholders = meta.columns.map(() => "?").join(", ");
    return `INSERT INTO "${meta.tableName}" (${cols}) VALUES (${placeholders})`;
  }

  compileUpdate(
    meta: EntityMetadata,
    criteria: Record<string, unknown>
  ): { sql: string; params: unknown[] } {
    const setClauses = meta.columns
      .filter((c) => !Object.keys(criteria).includes(c.name))
      .map((c) => `"${c.name}" = ?`)
      .join(", ");

    const whereClause = Object.keys(criteria)
      .map((k) => `"${k}" = ?`)
      .join(" AND ");

    const params = [
      ...meta.columns
        .filter((c) => !Object.keys(criteria).includes(c.name))
        .map((c) => undefined), // Placeholder for updated values (set by caller)
      ...Object.values(criteria),
    ];

    return {
      sql: `UPDATE "${meta.tableName}" SET ${setClauses} WHERE ${whereClause}`,
      params,
    };
  }

  compileSelect(
    meta: EntityMetadata,
    criteria?: Record<string, unknown>
  ): { sql: string; params: unknown[] } {
    let sql = `SELECT * FROM "${meta.tableName}"`;
    const params: unknown[] = [];

    if (criteria && Object.keys(criteria).length > 0) {
      const whereClause = Object.keys(criteria)
        .map((k) => `"${k}" = ?`)
        .join(" AND ");
      sql += ` WHERE ${whereClause}`;
      params.push(...Object.values(criteria));
    }

    return { sql, params };
  }

  compileDelete(
    meta: EntityMetadata,
    criteria: Record<string, unknown>
  ): { sql: string; params: unknown[] } {
    const whereClause = Object.keys(criteria)
      .map((k) => `"${k}" = ?`)
      .join(" AND ");
    return {
      sql: `DELETE FROM "${meta.tableName}" WHERE ${whereClause}`,
      params: Object.values(criteria),
    };
  }

  compileCount(meta: EntityMetadata): string {
    return `SELECT COUNT(*) as count FROM "${meta.tableName}"`;
  }

  private toSqlType(tsType: string): string {
    const typeMap: Record<string, string> = {
      number: "INTEGER",
      string: "TEXT",
      boolean: "INTEGER",
      Date: "TEXT",
    };
    return typeMap[tsType] || "TEXT";
  }
}

/**
 * Maps TypeScript types to SQLite scalar types and back.
 */
export class SqliteAdapter {
  toSqlValue(value: unknown, tsType: string): unknown {
    if (value === null || value === undefined) return null;
    if (tsType === "boolean") return value ? 1 : 0;
    if (tsType === "Date" && value instanceof Date)
      return value.toISOString();
    return value;
  }

  fromSqlValue(value: unknown, tsType: string): unknown {
    if (value === null || value === undefined) return null;
    if (tsType === "boolean") return value === 1;
    if (tsType === "Date" && typeof value === "string")
      return new Date(value);
    return value;
  }
}
