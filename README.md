# query-builder-wrapper

A lightweight, **learning-focused** Data Mapper ORM for better-sqlite3 with TypeScript.

## Overview

This library demonstrates how modern ORMs (like TypeORM and MikroORM) work under the hood by building a complete, type-safe query builder using:

- **Decorators** (`@Entity`, `@Column`) for metadata definition
- **Reflect Metadata API** for automatic type detection
- **Data Mapper Pattern** for clean separation of concerns
- **Unit of Work Pattern** for atomic transactions

```typescript
// Define entities with decorators
@Entity("users")
class User {
  @Column("user_id", true)
  id: number;

  @Column()
  username: string;
}

// Initialize and query
const dataSource = new DataSource({
  dbPath: "app.db",
  entities: [User],
  synchronize: true,
});

await dataSource.initialize();
const userRepo = dataSource.getRepository(User);
const user = userRepo.findOneBy({ username: "alice" });
```

## Installation

```bash
git clone https://github.com/GhCristea/query-builder-wrapper.git
cd query-builder-wrapper
npm install
```

## Quick Start

### 1. Enable TypeScript Decorators

In `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### 2. Define Entities

```typescript
import "reflect-metadata";
import { Entity, Column } from "query-builder-wrapper";

@Entity("users")
class User {
  @Column("user_id", true) // Primary key
  id: number;

  @Column()
  username: string;

  @Column()
  email: string;

  @Column()
  isActive: boolean;
}
```

### 3. Initialize DataSource

```typescript
import { DataSource } from "query-builder-wrapper";

const dataSource = new DataSource({
  dbPath: "app.db",
  entities: [User],
  synchronize: true,  // Auto-creates tables
  logging: true,      // Logs SQL operations
});

await dataSource.initialize();
```

### 4. Use Repository

```typescript
const userRepo = dataSource.getRepository(User);

// CREATE
const user = new User();
user.id = 1;
user.username = "alice";
user.email = "alice@example.com";
userRepo.save(user);

// READ
const found = userRepo.findOneBy({ username: "alice" });
const all = userRepo.find();
const active = userRepo.findBy({ isActive: true });

// UPDATE
userRepo.update({ id: 1 }, { email: "newemail@example.com" });

// DELETE
userRepo.delete({ id: 1 });

// COUNT
const total = userRepo.count();
```

## API Reference

### Decorators

#### `@Entity(tableName: string)`

Maps a TypeScript class to a database table.

```typescript
@Entity("users")
class User { }
```

#### `@Column(columnName?: string, isPrimary?: boolean)`

Maps a class property to a database column. Automatically detects types via `emitDecoratorMetadata`.

```typescript
@Entity("users")
class User {
  @Column("user_id", true)  // Primary key with custom name
  id: number;

  @Column()                 // Default property name as column
  username: string;
}
```

### Repository

Implements the Data Mapper pattern for CRUD operations.

```typescript
const repo = dataSource.getRepository(User);
```

#### Methods

- **`find(): T[]`** - Get all records
- **`findBy(criteria): T[]`** - Get records matching criteria (AND logic)
- **`findOneBy(criteria): T | undefined`** - Get single record
- **`save(entity): RunResult`** - Insert or replace (UPSERT)
- **`update(criteria, updates): RunResult`** - Update matching records
- **`delete(criteria): RunResult`** - Delete matching records
- **`count(): number`** - Count total records

### EntityManager

Manages transactions using the Unit of Work pattern.

```typescript
const manager = dataSource.manager;
```

#### Methods

- **`save(entity): RunResult`** - Save via repository
- **`transaction(callback): T`** - Execute atomic transaction
- **`getRepository(entity): Repository<T>`** - Get/create repository

### DataSource

Orchestrator for database connection and schema management.

```typescript
const ds = new DataSource({ /* config */ });
```

#### Methods

- **`initialize(): Promise<this>`** - Open connection and sync schema
- **`getRepository(entity): Repository<T>`** - Get repository
- **`destroy(): Promise<void>`** - Close connection
- **`isInitialized_check(): boolean`** - Check connection state

## Patterns Implemented

### Data Mapper Pattern

Entities are **pure domain objects** (POJOs) with no database logic. The Repository handles persistence.

**Benefit:** Easy to test, swap databases, and keep business logic clean.

```typescript
// Entity: Just data
@Entity("users")
class User {
  @Column()
  username: string;
}

// Repository: Handles persistence
const repo = dataSource.getRepository(User);
repo.save(user);
```

### Unit of Work Pattern

Transactions ensure multiple operations succeed or fail as a single atomic unit.

**Benefit:** Data consistency and integrity.

```typescript
try {
  dataSource.manager.transaction((manager) => {
    const userRepo = manager.getRepository(User);
    const profileRepo = manager.getRepository(Profile);

    // Both operations commit or both rollback
    userRepo.save(user);
    profileRepo.save(profile);
  });
} catch (err) {
  // Transaction rolled back automatically
}
```

### Repository Pattern

Abstracts data access logic behind a typed interface.

**Benefit:** Centralized, reusable query logic.

```typescript
interface IRepository<T> {
  find(): T[];
  findOneBy(criteria: Partial<T>): T | undefined;
  save(entity: T): void;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Application                                           │
├─────────────────────────────────────────────────────────────┤
│  Entities: @Entity, @Column decorators                      │
│  Domain logic (no database dependencies)                    │
├─────────────────────────────────────────────────────────────┤
│  DataSource                                                 │
│  ├─ Connection management (lazy init)                       │
│  ├─ Schema synchronization                                  │
│  └─ Repository factory                                      │
├─────────────────────────────────────────────────────────────┤
│  EntityManager (Unit of Work)                               │
│  ├─ Transaction boundaries                                  │
│  ├─ Repository caching                                      │
│  └─ Atomic operations                                       │
├─────────────────────────────────────────────────────────────┤
│  Repository (Data Mapper)                                   │
│  ├─ Metadata reflection                                     │
│  ├─ SQL generation                                          │
│  └─ Object mapping                                          │
├─────────────────────────────────────────────────────────────┤
│  better-sqlite3                                             │
│  (Fast, synchronous SQLite driver)                          │
└─────────────────────────────────────────────────────────────┘
```

## Type Safety

The library leverages TypeScript's type system:

```typescript
const repo = dataSource.getRepository(User);

// ✓ Type-safe: property names must match entity
const user = repo.findOneBy({ username: "alice" });

// ✗ Error: 'unknownProp' doesn't exist on User
const invalid = repo.findOneBy({ unknownProp: "value" });
```

Automatic type detection via `emitDecoratorMetadata`:

```typescript
@Entity("products")
class Product {
  @Column()
  price: number;  // Automatically mapped to INTEGER

  @Column()
  createdAt: Date;  // Automatically mapped to TEXT (ISO string)
}
```

## Examples

Run the learning examples:

```bash
npm run dev
```

This demonstrates:

1. **CRUD Operations** - Create, Read, Update, Delete
2. **Transactions** - Atomic multi-entity operations
3. **Schema Synchronization** - Auto table creation

## Learning Goals

Understand how:

1. ✅ Decorators store metadata on class prototypes
2. ✅ Reflect API reads metadata at runtime
3. ✅ Repositories translate objects to SQL dynamically
4. ✅ Transactions implement the Unit of Work pattern
5. ✅ Type-safe queries work with TypeScript generics
6. ✅ Better-sqlite3 prepared statements prevent SQL injection

## Key Design Principles

- **KISS** (Keep It Simple, Stupid) - No unnecessary abstractions
- **YAGNI** (You Aren't Gonna Need It) - No features you won't use
- **Separation of Concerns** - Entities, Repository, EntityManager are distinct
- **Type Safety** - TypeScript first, runtime second

## Limitations (By Design)

This is a **learning library**, not production-grade. It intentionally avoids:

- ❌ Relationships (foreign keys, joins)
- ❌ Migrations (use proper tools like Prisma or TypeORM for this)
- ❌ Complex query builders (single table only)
- ❌ Lazy loading / eager loading
- ❌ Caching strategies

For production use, consider:

- **TypeORM** - Full-featured, industry standard
- **Prisma** - Type-safe, migration-first
- **Kysely** - Lightweight, SQL-first approach

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run examples
npm run dev

# Clean
npm run clean
```

## File Structure

```
src/
├── types.ts          # Core interfaces and type definitions
├── decorators.ts     # @Entity, @Column decorator definitions
├── repository.ts     # CRUD operations (Data Mapper)
├── entity-manager.ts # Transaction support (Unit of Work)
├── data-source.ts    # Connection & schema orchestration
├── index.ts          # Public exports
└── examples.ts       # Learning examples
```

## License

MIT

## Author

GhCristea - [GitHub](https://github.com/GhCristea)

## References

- [Data Mapper Pattern](https://martinfowler.com/eaaCatalog/dataMapper.html)
- [Unit of Work Pattern](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [Reflect Metadata Proposal](https://rbuckton.github.io/reflect-metadata/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
