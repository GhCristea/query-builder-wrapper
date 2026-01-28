/**
 * Decorators for defining entity metadata.
 * These decorators use reflect-metadata to store schema information on class prototypes.
 *
 * Key principle: Decorators are purely declarative. They don't execute queries—they
 * simply annotate TypeScript classes with database schema metadata that the query
 * builder reads at runtime.
 */

import "reflect-metadata";
import { TABLE_KEY, COLUMN_KEY, PRIMARY_KEY, ColumnMetadata } from "./types";

/**
 * Entity decorator maps a TypeScript class to a database table.
 *
 * @param tableName - The name of the database table
 *
 * @example
 * ```typescript
 * @Entity("users")
 * class User {
 *   @Column()
 *   id: number;
 * }
 * ```
 */
export function Entity(tableName: string): ClassDecorator {
  return (target: Function) => {
    if (!tableName || tableName.trim().length === 0) {
      throw new Error(`Entity decorator requires a non-empty table name.`);
    }

    // Validate table name: alphanumeric, underscore, no SQL keywords
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(
        `Invalid table name "${tableName}". Must start with letter or underscore and contain only alphanumeric characters and underscores.`
      );
    }

    Reflect.defineMetadata(TABLE_KEY, tableName, target);
  };
}

/**
 * Column decorator maps a TypeScript property to a database column.
 *
 * Automatically detects the TypeScript type (String, Number, Boolean, Date) via
 * emitDecoratorMetadata in tsconfig.json. This enables type-safe SQL generation.
 *
 * @param columnName - Optional database column name. Defaults to property name.
 * @param isPrimary - Optional flag for primary key columns
 *
 * @example
 * ```typescript
 * @Entity("users")
 * class User {
 *   @Column("user_id", true)
 *   id: number;
 *
 *   @Column()
 *   username: string;
 * }
 * ```
 */
export function Column(
  columnName?: string,
  isPrimary?: boolean
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    // Extract the TypeScript type emitted by emitDecoratorMetadata
    const type = Reflect.getMetadata("design:type", target, propertyKey);

    if (!type) {
      throw new Error(
        `@Column on ${String(propertyKey)} failed to detect type. Ensure emitDecoratorMetadata is enabled in tsconfig.json`
      );
    }

    // Get or initialize the columns array
    const columns: ColumnMetadata[] =
      Reflect.getMetadata(COLUMN_KEY, target.constructor) || [];

    // Add this column's metadata
    columns.push({
      property: propertyKey,
      column: columnName || String(propertyKey),
      type,
      isPrimary: isPrimary || false,
    });

    // Store back to the constructor (class level)
    Reflect.defineMetadata(COLUMN_KEY, columns, target.constructor);

    // Mark primary key if specified
    if (isPrimary) {
      Reflect.defineMetadata(PRIMARY_KEY, propertyKey, target.constructor);
    }
  };
}

/**
 * Utility function to extract table name from an entity class.
 * Used internally by Repository and DataSource.
 *
 * @param entity - The entity class
 * @returns The table name
 * @throws Error if entity is not decorated with @Entity
 */
export function getTableName(entity: Function): string {
  const table = Reflect.getMetadata(TABLE_KEY, entity);
  if (!table) {
    throw new Error(
      `Entity ${entity.name} is missing @Entity decorator or has no metadata.`
    );
  }
  return table;
}

/**
 * Utility function to extract column metadata from an entity class.
 * Used internally by Repository and DataSource.
 *
 * @param entity - The entity class
 * @returns Array of column metadata
 * @throws Error if entity has no columns
 */
export function getColumnMetadata(entity: Function): ColumnMetadata[] {
  const columns = Reflect.getMetadata(COLUMN_KEY, entity);
  if (!columns || columns.length === 0) {
    throw new Error(
      `Entity ${entity.name} has no @Column decorators defined.`
    );
  }
  return columns;
}

/**
 * Utility function to get the primary key property for an entity.
 *
 * @param entity - The entity class
 * @returns The primary key property name, or undefined if not marked
 */
export function getPrimaryKey(entity: Function): string | symbol | undefined {
  return Reflect.getMetadata(PRIMARY_KEY, entity);
}
