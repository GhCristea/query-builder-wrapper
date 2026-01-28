# Learning Guide: Building an ORM from Scratch

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [How Decorators Work](#how-decorators-work)
3. [Metadata Reflection](#metadata-reflection)
4. [The Repository Pattern](#the-repository-pattern)
5. [Transactions and Unit of Work](#transactions-and-unit-of-work)
6. [Putting It Together](#putting-it-together)
7. [Common Pitfalls](#common-pitfalls)

---

## Core Concepts

### What is an ORM?

An **Object-Relational Mapper** bridges the gap between:

- **Object-oriented world** (TypeScript classes, instances)
- **Relational world** (SQL tables, rows, columns)

```typescript
// OOP world
const user = new User();
user.username = "alice";

// SQL world (what the ORM generates)
INSERT INTO users (username) VALUES ('alice');
```

### The Problem Without an ORM

```typescript
// Raw SQL - fragile, repetitive, error-prone
const db = new Database("app.db");
const stmt = db.prepare(
  "INSERT INTO users (user_id, username, email) VALUES (?, ?, ?)"
);
stmt.run(1, "alice", "alice@example.com");

// What if the table schema changes? Update all queries manually!
```

### The Solution: Metadata-Driven Design

Define schema ONCE in your entity, and the ORM generates queries automatically:

```typescript
@Entity("users")
class User {
  @Column("user_id", true)
  id: number;

  @Column()
  username: string;

  @Column()
  email: string;
}

// The ORM knows the schema now
// If the schema changes, you only update the entity
```

---

## How Decorators Work

### What is a Decorator?

A decorator is a TypeScript function that receives metadata about a class or property.

```typescript
// A decorator is just a function
function MyDecorator() {
  return function (target: any) {
    // target = the class being decorated
    console.log(`Decorating class: ${target.name}`);
  };
}

@MyDecorator()
class User {}

// Output: "Decorating class: User"
```

### Our Decorators: `@Entity` and `@Column`

#### `@Entity`

```typescript
export function Entity(tableName: string): ClassDecorator {
  return (target: Function) => {
    // Store the table name on the class constructor
    Reflect.defineMetadata(TABLE_KEY, tableName, target);
  };
}

// Usage
@Entity("users")
class User { }

// What happens:
// 1. TypeScript calls Entity("users")
// 2. Returns a function
// 3. That function receives the User class
// 4. We store "users" as metadata on User
```

#### `@Column`

```typescript
export function Column(columnName?: string, isPrimary?: boolean): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    // Extract the type (String, Number, etc.) via emitDecoratorMetadata
    const type = Reflect.getMetadata("design:type", target, propertyKey);

    // Accumulate columns
    const columns = Reflect.getMetadata(COLUMN_KEY, target.constructor) || [];
    columns.push({
      property: propertyKey,
      column: columnName || String(propertyKey),
      type,
      isPrimary,
    });

    // Store back
    Reflect.defineMetadata(COLUMN_KEY, columns, target.constructor);
  };
}

// Usage
@Entity("users")
class User {
  @Column("user_id", true)
  id: number;

  @Column()
  username: string;
}

// What happens:
// 1. For each @Column, we extract the TypeScript type
// 2. We store the property-to-column mapping
// 3. We build an array of columns
```

### Key Insight: `emitDecoratorMetadata`

Why do we need `emitDecoratorMetadata: true` in `tsconfig.json`?

```typescript
// WITH emitDecoratorMetadata
@Column()
username: string;  // TypeScript emits: { design:type -> String constructor }

// WITHOUT emitDecoratorMetadata
@Column()
username: string;  // No type information available (design:type = undefined)
```

This is how we auto-detect types!

---

## Metadata Reflection

### What is the Reflect API?

The `reflect-metadata` library provides a key-value store for metadata on classes.

```typescript
import "reflect-metadata";

// Store metadata
Reflect.defineMetadata("myKey", "myValue", MyClass);

// Retrieve metadata
const value = Reflect.getMetadata("myKey", MyClass); // "myValue"
```

### How We Use It

```typescript
// When the decorator runs, we DEFINE metadata
@Entity("users")
class User {
  @Column()
  username: string;
}

// Later, when we query, we GET metadata
const tableName = Reflect.getMetadata(TABLE_KEY, User); // "users"
const columns = Reflect.getMetadata(COLUMN_KEY, User);
// [{ property: "username", column: "username", type: String }]
```

### Metadata at Runtime vs Compile Time

```typescript
// Compile time (tsc)
// TypeScript reads @Column() and class properties
// emitDecoratorMetadata tells tsc to emit type metadata

// Runtime (Node.js)
// reflect-metadata library intercepts metadata access
// We call Reflect.getMetadata() to retrieve what tsc emitted
```

---

## The Repository Pattern

### What is a Repository?

A **Repository** abstracts data access. Instead of writing raw SQL in your business logic, you use the repository:

```typescript
// WITH Repository (clean)
const user = userRepository.findOneBy({ id: 1 });

// WITHOUT Repository (scattered SQL)
const sql = "SELECT * FROM users WHERE id = ?";
const user = db.prepare(sql).get(1);
// ... repeat this everywhere ...
```

### Our Repository Implementation

```typescript
export class Repository<T extends object> {
  constructor(private entity: new () => T, private db: Database.Database) {
    this.tableName = getTableName(entity);
    this.columns = getColumnMetadata(entity);
  }

  save(entity: T): Database.RunResult {
    // 1. Read metadata
    const keys = this.columns.map((c) => c.column).join(", ");
    const placeholders = this.columns.map(() => "?").join(", ");
    const values = this.columns.map((c) => (entity as any)[c.property]);

    // 2. Generate SQL dynamically
    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${keys}) VALUES (${placeholders})`;

    // 3. Execute
    return this.db.prepare(sql).run(...values);
  }
}

// The repository uses metadata to:
// 1. Know which table to use
// 2. Know which columns exist
// 3. Generate correct SQL
// 4. Map entity properties to SQL parameters
```

### Dynamic SQL Generation

```typescript
// Given this entity
@Entity("users")
class User {
  @Column("user_id")
  id: number;

  @Column()
  username: string;
}

// The repository generates this SQL
INSERT INTO users (user_id, username) VALUES (?, ?)

// And maps your entity to parameters
const user = new User();
user.id = 1;
user.username = "alice";

// The repository extracts: [1, "alice"]
// And executes: db.prepare(sql).run(1, "alice")
```

### Type Safety

Repositories are generic, so TypeScript validates property names:

```typescript
const userRepo: Repository<User> = ...;

// ✓ Valid: username exists on User
const user = userRepo.findOneBy({ username: "alice" });

// ✗ Error: invalidProp doesn't exist on User
const invalid = userRepo.findOneBy({ invalidProp: "alice" });
```

---

## Transactions and Unit of Work

### The Problem

Without transactions, partial failures corrupt your data:

```typescript
// User is created
userRepo.save(user);  // ✓ Success

// Profile creation fails
profileRepo.save(profile);  // ✗ Error

// Result: Orphaned user with no profile (data inconsistency!)
```

### The Solution: Unit of Work

Group related operations. Either ALL succeed or ALL fail:

```typescript
try {
  manager.transaction((manager) => {
    userRepo.save(user);      // Operation 1
    profileRepo.save(profile); // Operation 2
  });
  // If we reach here, BOTH succeeded
} catch (err) {
  // If ANY operation failed, BOTH are rolled back
}
```

### How It Works in SQLite

```typescript
export class EntityManager {
  transaction<T>(callback: TransactionCallback<T>): T {
    // better-sqlite3 provides a .transaction() method
    const transactionFn = this.db.transaction(() => {
      return callback(this);
    });

    // Executing transactionFn runs:
    // BEGIN TRANSACTION
    // ... your operations ...
    // COMMIT (or ROLLBACK on error)
    return transactionFn();
  }
}

// When you call manager.transaction():
// 1. better-sqlite3 issues BEGIN
// 2. Your callback runs (any errors are caught)
// 3. If no errors: COMMIT
// 4. If error: ROLLBACK (automatic)
```

### Benefits

```typescript
// ✓ Atomicity: All or nothing
// ✓ Consistency: No partial states
// ✓ Isolation: No dirty reads
// ✓ Durability: Once committed, persisted
```

---

## Putting It Together

### Step-by-Step Execution

```typescript
// 1. DEFINE (decorators run)
@Entity("users")
class User {
  @Column("user_id", true)
  id: number;

  @Column()
  username: string;
}

// Metadata stored:
// User -> TABLE_KEY -> "users"
// User -> COLUMN_KEY -> [{property: "id", column: "user_id", ...}, {...}]

// 2. INITIALIZE (connection opens)
const ds = new DataSource({
  dbPath: "app.db",
  entities: [User],
  synchronize: true,
});
await ds.initialize();

// DataSource:
// - Opens better-sqlite3 connection
// - Reads metadata from User
// - Generates: CREATE TABLE IF NOT EXISTS users (...)
// - Executes the SQL

// 3. QUERY (runtime)
const userRepo = ds.getRepository(User);
const user = new User();
user.id = 1;
user.username = "alice";
userRepo.save(user);

// Repository:
// - Reads metadata from User class
// - Gets table name: "users"
// - Gets columns: [{property: "id", column: "user_id"}, {...}]
// - Extracts values from user instance: [1, "alice"]
// - Generates SQL: INSERT INTO users (user_id, username) VALUES (?, ?)
// - Executes: db.prepare(sql).run(1, "alice")
```

---

## Common Pitfalls

### Pitfall 1: Forgetting `emitDecoratorMetadata`

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    // ✗ MISSING: "emitDecoratorMetadata": true
  }
}

// Result: design:type is undefined
// The decorator can't detect that username is a String!
```

**Fix:** Add `"emitDecoratorMetadata": true`

### Pitfall 2: Forgetting `import "reflect-metadata"`

```typescript
// ✗ Missing this
// import "reflect-metadata";

@Entity("users")
class User { }

// Result: Reflect API isn't available
// Error: Reflect is not defined
```

**Fix:** Import at the top of your entry file:

```typescript
import "reflect-metadata";
import { DataSource } from "query-builder-wrapper";
```

### Pitfall 3: Not Awaiting `initialize()`

```typescript
const ds = new DataSource({ /* ... */ });
ds.initialize();  // ✗ Not awaited

const repo = ds.getRepository(User);  // ✗ DB not ready yet!
```

**Fix:** Always await:

```typescript
await ds.initialize();
const repo = ds.getRepository(User);  // Now safe
```

### Pitfall 4: Assuming Decorators Execute SQL

```typescript
@Entity("users")
class User {
  @Column()
  username: string;
}

// ✗ Wrong assumption: Decorators ran SQL?
// They didn't! They just stored metadata.

// ✓ Correct: SQL happens during:
// 1. DataSource.initialize() - creates table
// 2. Repository.save() - inserts data
```

### Pitfall 5: Table Name Injection

```typescript
// ✗ Don't do this
const tableName = getUserInputTableName();  // e.g., "users'; DROP TABLE--"
@Entity(tableName)
class User { }

// While decorators store it safely, runtime SQL generation could be vulnerable
```

**Fix:** Validate table names in decorators (we do this):

```typescript
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
  throw new Error(`Invalid table name`);
}
```

---

## Next Steps: Enhancing the ORM

### What We COULD Add

1. **Relationships**
   ```typescript
   @Entity("users")
   class User {
     @OneToMany(() => Post)
     posts: Post[];
   }
   ```

2. **Migrations**
   ```typescript
   // Instead of synchronize: true (destructive)
   // Use versioned migrations (safe)
   ```

3. **Hooks/Events**
   ```typescript
   @BeforeSave()
   validate() { }
   ```

4. **Validation**
   ```typescript
   @Column()
   @Min(18)
   @Max(120)
   age: number;
   ```

### Why We DON'T (Learning Goals)

This library prioritizes **understanding** over features:

- **KISS** - Each feature must teach a principle
- **YAGNI** - Only what's needed to understand the core
- **Clarity** - Code should be readable, not clever

For production, use:

- **TypeORM** - Full ecosystem
- **Prisma** - Modern, type-safe
- **Kysely** - Lightweight, SQL-first

---

## References

- [Decorators - TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [Reflect Metadata Proposal](https://rbuckton.github.io/reflect-metadata/)
- [Data Mapper Pattern](https://martinfowler.com/eaaCatalog/dataMapper.html)
- [Unit of Work Pattern](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)

---

## Questions?

Read the source code! Each file is heavily commented.

1. Start with `src/types.ts` (understand the data structures)
2. Read `src/decorators.ts` (understand metadata storage)
3. Study `src/repository.ts` (understand SQL generation)
4. Trace through `src/examples.ts` (understand usage)
