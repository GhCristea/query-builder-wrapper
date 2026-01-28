# Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Your Application                                 │
│  (Business Logic: Services, Controllers, Use Cases)                     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                    Uses (Dependency Injection)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     query-builder-wrapper API                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Decorators (Metadata Definition)                                │   │
│  │  - @Entity("table_name")                                        │   │
│  │  - @Column("col_name", isPrimary)                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│                    Stores metadata via Reflect API                      │
│                                 │                                       │
│                                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Reflect Metadata Registry                                        │   │
│  │                                                                 │   │
│  │  Entity.TABLE_KEY -> "users"                                   │   │
│  │  Entity.COLUMN_KEY -> [{ property, column, type, isPrimary }]  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│                    Read by (Service Locator)                            │
│                                 │                                       │
│                                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ DataSource (Orchestrator)                                        │   │
│  │                                                                 │   │
│  │  • initialize()          → Opens DB, syncs schema               │   │
│  │  • getRepository<T>()    → Creates/caches Repository            │   │
│  │  • destroy()             → Closes connection                    │   │
│  │  • manager               → Provides EntityManager               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│                  Factory for Repositories and Manager                   │
│           ┌────────────────────┬────────────────────┐                  │
│           ▼                    ▼                     ▼                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │  Repository<T>   │  │  EntityManager   │  │   Repository<U>  │    │
│  │  (Data Mapper)   │  │  (Unit of Work)  │  │  (Data Mapper)   │    │
│  │                  │  │                  │  │                  │    │
│  │ • find()         │  │ • transaction()  │  │ • find()         │    │
│  │ • findBy()       │  │ • save()         │  │ • findOneBy()    │    │
│  │ • findOneBy()    │  │ • getRepository()│  │ • save()         │    │
│  │ • save()         │  │                  │  │ • update()       │    │
│  │ • update()       │  │ (caches repos)   │  │ • delete()       │    │
│  │ • delete()       │  │                  │  │ • count()        │    │
│  │ • count()        │  └──────────────────┘  │                  │    │
│  └──────────────────┘                         └──────────────────┘    │
│           │                                             │             │
│  Reads metadata, generates SQL,                         │             │
│  Caches compiled statements, maps rows                  │             │
│           │                                             │             │
└───────────┼─────────────────────────────────────────────┼─────────────┘
            │                                             │
            │                    Delegates to
            │                                             │
            └────────────────────┬──────────────────────┘
                                 │
                                 ▼
            ┌─────────────────────────────────────┐
            │      better-sqlite3 Driver          │
            │                                     │
            │ • db.prepare(sql)                   │
            │ • stmt.run(...values)               │
            │ • db.transaction()                  │
            │ • db.close()                        │
            │                                     │
            │ (Fast, synchronous SQLite)          │
            └──────────────┬──────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────────┐
            │     SQLite Database (app.db)         │
            │                                      │
            │  Tables created from metadata       │
            │  Data persisted atomically          │
            │  Transactions managed natively      │
            └──────────────────────────────────────┘
```

## Data Flow: Entity Lifecycle

### 1. Entity Definition

```typescript
@Entity("users")
class User {
  @Column("user_id", true)
  id: number;
  
  @Column()
  username: string;
}

// RESULT: Metadata stored on User class constructor
// Reflect.getMetadata(TABLE_KEY, User) → "users"
// Reflect.getMetadata(COLUMN_KEY, User) → [
//   { property: "id", column: "user_id", type: Number, isPrimary: true },
//   { property: "username", column: "username", type: String, isPrimary: false }
// ]
```

### 2. DataSource Initialization

```
User defines: @Entity("users")
         │
         ▼ (passed to DataSource)
DataSource reads metadata
         │
         ├─ Discovers: table = "users"
         ├─ Discovers: columns = [{id, username}]
         │
         ▼
Generates SQL
         │
         ├─ CREATE TABLE IF NOT EXISTS users (
         │    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
         │    username TEXT
         │  )
         │
         ▼
Executes via better-sqlite3
         │
         ▼ (on success)
Table exists, ready for queries
```

### 3. Save Operation

```
const user = new User()
user.id = 1
user.username = "alice"
         │
         ▼
userRepository.save(user)
         │
         ├─ Read metadata: columns = [{id, username}]
         ├─ Extract values: [1, "alice"]
         │
         ├─ Generate SQL:
         │  INSERT OR REPLACE INTO users (user_id, username) VALUES (?, ?)
         │
         ├─ Prepare statement: db.prepare(sql)
         │
         ▼
Execute: stmt.run(1, "alice")
         │
         ▼
Database: INSERT operation complete
         │
         ▼
Return: { changes: 1, lastInsertRowid: 1 }
```

### 4. Query Operation

```
userRepository.findOneBy({ username: "alice" })
         │
         ├─ Read metadata: columns = [{id, username}]
         ├─ Build WHERE: username = ?
         │
         ├─ Generate SQL:
         │  SELECT * FROM users WHERE username = ? LIMIT 1
         │
         ├─ Prepare statement: db.prepare(sql)
         │
         ├─ Execute: get("alice")
         │
         ▼
Database returns row: { user_id: 1, username: "alice" }
         │
         ├─ Map row to entity:
         │  Create new User()
         │  user.id = 1
         │  user.username = "alice"
         │
         ▼
Return: User instance
```

### 5. Transaction Operation

```
manager.transaction((txManager) => {
  userRepo.save(user)
  profileRepo.save(profile)
})
         │
         ├─ Invoke: db.transaction(() => { ... })()
         │
         ├─ better-sqlite3 executes:
         │  BEGIN TRANSACTION
         │
         ├─ Run operations in callback:
         │  INSERT INTO users ...
         │  INSERT INTO profiles ...
         │
         ├─ On success:
         │  COMMIT
         │
         └─ On error:
            ROLLBACK (automatic)

// RESULT: Both operations atomic
// Either both succeed or both fail
```

## Class Dependency Hierarchy

```
┌──────────────────────────────────┐
│         DataSource               │
│  (Connection Orchestrator)       │
│                                  │
│ • db: Database                   │
│ • manager: EntityManager         │
│ • initialize()                   │
│ • getRepository<T>()             │
└────────────┬─────────────────────┘
             │
      Creates and owns
             │
             ▼
┌──────────────────────────────────┐
│      EntityManager               │
│  (Unit of Work Coordinator)      │
│                                  │
│ • db: Database                   │
│ • transaction<T>()               │
│ • getRepository<T>()             │
│ • repositoryCache: Map           │
└────────────┬─────────────────────┘
             │
    Factories and caches
             │
             ▼
┌──────────────────────────────────────┐
│      Repository<T>                   │
│  (Data Mapper - CRUD Operations)     │
│                                      │
│ • entity: new () => T               │
│ • db: Database                      │
│ • tableName: string (cached)        │
│ • columns: ColumnMetadata[] (cached)│
│                                      │
│ • find(): T[]                       │
│ • findBy(criteria): T[]             │
│ • findOneBy(criteria): T | undefined│
│ • save(entity): RunResult           │
│ • update(criteria, updates)         │
│ • delete(criteria): RunResult       │
│ • count(): number                   │
└────────────┬─────────────────────────┘
             │
      Reflects metadata from
             │
             ▼
┌──────────────────────────────────┐
│      TypeScript Entity           │
│  (Domain Object - Pure Data)     │
│                                  │
│ @Entity("table_name")            │
│ class MyEntity {                 │
│   @Column("col", isPrimary)      │
│   property: ColumnType;          │
│ }                                │
│                                  │
│ Stores Reflect metadata          │
└──────────────────────────────────┘
```

## Metadata Storage

```
Entity Class Constructor
│
├─ Symbol("table") → "users"
│  (Stored by @Entity decorator)
│
├─ Symbol("column") → [
│  (Stored by @Column decorators)
│    {
│      property: "id",
│      column: "user_id",
│      type: Number,
│      isPrimary: true
│    },
│    {
│      property: "username",
│      column: "username",
│      type: String,
│      isPrimary: false
│    }
│  ]
│
└─ Symbol("primary") → "id"
   (Stored by @Column decorator if isPrimary=true)
```

## Type Detection Flow

```
TypeScript Source:
  @Column()
  username: string;
           │
           ├─ emitDecoratorMetadata: true in tsconfig.json
           │
           ▼
Compiled to JavaScript:
  __decorate([
    Column(),
    __metadata("design:type", String)  ← Type emitted by compiler
  ], User.prototype, "username", void 0);
           │
           ├─ Decorator receives: design:type = String constructor
           │
           ▼
@Column decorator reads type:
  const type = Reflect.getMetadata("design:type", target, propertyKey);
           │
           ├─ type.name = "String"
           │
           ▼
Repository uses TYPE_MAP:
  TYPE_MAP["String"] = "TEXT"
           │
           ▼
SQL Generated:
  CREATE TABLE users (
    username TEXT  ← Type derived automatically!
  )
```

## Error Handling Flow

```
Error in DataSource.initialize()
  │
  ├─ Metadata read failed
  ├─ Database file not accessible
  ├─ Table creation SQL error
  │
  ▼
Catch in try-catch
  │
  ├─ Wrap in Error with context
  ├─ Message: "Failed to initialize DataSource: ..."
  │
  ▼
Throw to caller
  │
  ▼
Caller must await and catch

Error in Repository.save()
  │
  ├─ Metadata missing (entity not decorated)
  ├─ No columns defined
  ├─ SQL generation failed
  ├─ Database constraint violation
  │
  ▼
Throw (not caught by repository)
  │
  ▼
Caller catches
  │
  ├─ If in transaction: rolls back automatically
  ├─ Otherwise: handle error
```

## Memory Management

```
DataSource
  │
  ├─ db: Database (single connection, kept open)
  │
  └─ EntityManager
       │
       └─ repositoryCache: Map<Function, Repository>
            │
            ├─ Key: Entity class constructor
            ├─ Value: Repository instance (created once, reused)
            │
            └─ Each Repository caches:
                 • tableName (string)
                 • columns (ColumnMetadata[])

// RESULT:
// - Single DB connection (efficient)
// - Repositories created once per entity type (fast lookups)
// - Metadata read from Reflect API once per repository (fast)
// - SQL prepared statements cached by better-sqlite3 (very fast)
```

## Performance Considerations

### Fast Operations
- **Metadata lookup**: O(1) cached per repository instance
- **SQL preparation**: O(1) cached by better-sqlite3
- **Single row insert**: ~0.1ms
- **Transaction overhead**: <1% for short transactions

### Potential Bottlenecks
- **Large batch operations**: No batch insert optimization (iterate instead)
- **Complex queries**: Single-table only (use raw SQL for joins)
- **Schema changes**: Requires full table rebuild (migrations needed)

### Recommendations
- Batch operations: Use transactions to group multiple saves
- Complex queries: Write raw SQL and pass results to entity constructor
- Production: Consider TypeORM/Prisma for complex needs

## Concurrency Model

better-sqlite3 is **synchronous and single-threaded**:

```
// All operations execute sequentially
stmt1.run();  // Waits for completion
stmt2.run();  // Executes after stmt1

// No async/await needed (unlike async drivers)
// No connection pooling needed
// No race conditions possible
// Simple to reason about
```

Benefits:
- ✓ Simpler code (no async complications)
- ✓ Transactions are naturally isolated
- ✓ No connection pool overhead
- ✓ Fast for most use cases

Limitations:
- ✗ Can't run parallel queries
- ✗ Not ideal for high concurrency
- ✗ Blocks event loop (use for lightweight services)

## Summary

The architecture follows clean layering:

1. **Decorators** define schema (metadata)
2. **Reflect API** stores metadata
3. **DataSource** orchestrates initialization
4. **EntityManager** manages transactions and repositories
5. **Repository** implements Data Mapper (generates SQL, maps rows)
6. **better-sqlite3** executes SQL safely

Each layer has a single responsibility and clear dependency flow.
