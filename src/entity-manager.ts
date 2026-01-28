/**
 * EntityManager implements the Unit of Work pattern.
 *
 * The Unit of Work pattern ensures that multiple operations succeed or fail
 * as a single atomic unit. In SQLite (via better-sqlite3), this is achieved
 * using the .transaction() method which handles BEGIN, COMMIT, and ROLLBACK.
 *
 * Key responsibility: Manage transactional boundaries and provide atomic
 * operations for multiple entities.
 */

import type Database from "better-sqlite3";
import { Repository } from "./repository";
import {
  IEntityManager,
  TransactionCallback,
} from "./types";
import { getTableName, getColumnMetadata } from "./decorators";

export class EntityManager implements IEntityManager {
  private repositoryCache: Map<Function, Repository<any>> = new Map();

  constructor(private db: Database.Database) {}

  /**
   * Save an entity using a repository.
   * Creates or retrieves a cached repository for the entity type.
   *
   * @param entity - The entity instance to save
   * @returns Result with lastID and changes count
   *
   * @example
   * ```typescript
   * const user = new User();
   * user.id = 1;
   * user.username = "alice";
   * manager.save(user);
   * ```
   */
  save<T extends object>(entity: T): Database.RunResult {
    const repository = this.getRepository(entity.constructor as new () => T);
    return repository.save(entity);
  }

  /**
   * Execute multiple operations within a single transaction.
   * If any operation throws an error, all changes are rolled back.
   *
   * The transaction callback receives this EntityManager instance
   * (or a scoped version), allowing you to perform multiple operations
   * that will be committed or rolled back together.
   *
   * @param callback - Function that performs operations on this manager
   * @returns The return value of the callback
   *
   * @example
   * ```typescript
   * try {
   *   manager.transaction((txManager) => {
   *     const user = new User();
   *     user.id = 1;
   *     user.username = "alice";
   *     txManager.save(user);
   *
   *     const profile = new Profile();
   *     profile.userId = 1;
   *     txManager.save(profile);
   *
   *     return { user, profile };
   *   });
   *   console.log("Transaction committed successfully");
   * } catch (err) {
   *   console.error("Transaction failed, changes rolled back:", err);
   * }
   * ```
   */
  transaction<T>(callback: TransactionCallback<T>): T {
    // better-sqlite3's .transaction() returns a function that we execute
    const transactionFn = this.db.transaction(() => {
      return callback(this);
    });

    // Execute and return the result (or throw on failure)
    return transactionFn();
  }

  /**
   * Get or create a Repository for an entity type.
   * Caches repositories to avoid re-instantiation.
   *
   * @param entity - The entity class
   * @returns Typed Repository instance
   *
   * @example
   * ```typescript
   * const userRepo = manager.getRepository(User);
   * const users = userRepo.find();
   * ```
   */
  getRepository<T extends object>(entity: new () => T): Repository<T> {
    if (!this.repositoryCache.has(entity)) {
      this.repositoryCache.set(entity, new Repository(entity, this.db));
    }
    return this.repositoryCache.get(entity) as Repository<T>;
  }
}
