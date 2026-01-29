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

import type Database from 'better-sqlite3';
import { Repository } from './repository';
import { IEntityManager, TransactionCallback, Constructor } from './types';

export class EntityManager implements IEntityManager {
  private repositoryCache: Map<Constructor, Repository<object>> = new Map();

  constructor(private db: Database.Database) {}

  save<T extends object>(entity: T): Database.RunResult {
    const repository = this.getRepository(entity.constructor as new () => T);
    return repository.save(entity);
  }

  transaction<T>(callback: TransactionCallback<T>): T {
    // better-sqlite3's .transaction() returns a function that we execute
    const transactionFn = this.db.transaction(() => {
      return callback(this);
    });

    // Execute and return the result (or throw on failure)
    return transactionFn();
  }

  getRepository<T extends object>(entity: Constructor<T>): Repository<T> {
    if (!this.repositoryCache.has(entity)) {
      this.repositoryCache.set(entity, new Repository(entity, this.db));
    }
    return this.repositoryCache.get(entity) as Repository<T>;
  }
}
