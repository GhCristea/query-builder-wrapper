# Design Decisions

## Overview

This document explains key architectural decisions and the rationale behind them. The goal is **solid design without over-engineering**—patterns you'll see in production ORMs (Prisma, TypeORM, MikroORM) but scaled to learning-appropriate complexity.

## Core Principles

1. **KISS** (Keep It Simple, Stupid) — No abstractions beyond necessity
2. **YAGNI** (You Aren't Gonna Need It) — Only features that exist *today*
3. **Separation of Concerns** — Each module has one clear responsibility
4. **Type Safety** — TypeScript first, runtime validation second
5. **Explicit over Implicit** — Configuration is visible and obvious

---

## 1. Adapter Pattern

### Decision

We introduced `SqliteAdapter` as a thin abstraction over `better-sqlite3`.

### Why

**Solid Design**: The Adapter pattern is fundamental in professional ORMs:
- **Prisma 7+**: Uses driver adapters to separate database logic from ORM logic
- **TypeORM**: Uses "drivers" to support multiple databases
- **MikroORM**: Supports multiple drivers via abstraction

**For Learning**:
- Shows how ORMs achieve database independence
- Makes testing easier (you can mock the adapter)
- Clear interface contract—easy to understand dependencies

**Minimal Scope**:
- Only 5 public methods: `prepare()`, `transaction()`, `tableExists()`, `close()`, `getDb()`
- No query builder, no connection pooling—just wraps better-sqlite3
- ~100 lines, very readable

### What It Enables

```typescript
// In the future, someone could write:
class PostgresAdapter implements IAdapter { ... }
// But the ORM logic (Repository, EntityManager) stays unchanged
```

---

## 2. Config Pattern (defineConfig + env)

### Decision

Introduced `defineConfig()` and `env()` helpers in `config.ts`.

### Why

**Familiarity**: Prisma users immediately recognize this pattern:
```typescript
// Prisma
export default defineConfig({
  datasource: { url: env('DATABASE_URL') }
})

// Now in query-builder-wrapper
export default defineConfig({
  dbPath: env('DATABASE_URL')
})
```

**Explicit Philosophy**:
- No magic `.env` loading (the ORM doesn't do it)
- Users choose: `import 'dotenv/config'` OR `node --env-file=.env`
- Configuration is visible in code, not hidden in CLI behavior
- Matches Prisma's stance on not auto-loading `.env`

**Validation**:
- `defineConfig()` validates required fields at startup, not runtime
- Early feedback: catch config errors immediately
- `env()` throws if a required variable is missing

### What It Enables

```typescript
// orm.config.ts
import { defineConfig, env } from 'query-builder-wrapper'

export default defineConfig({
  dbPath: env('DATABASE_URL', 'file:./app.db'), // defaults supported
  entities: [User, Product],
  synchronize: process.env.NODE_ENV !== 'production',
})

// main.ts
import 'dotenv/config'  // explicit, at the top
import config from './orm.config.ts'

const dataSource = new DataSource(config)
await dataSource.initialize()
```

---

## 3. Public API Cleanup

### Decision

Updated `index.ts` to export only:
- **Decorators**: `Entity`, `Column`, metadata helpers
- **Core**: `DataSource`, `Repository`, `EntityManager`
- **Config**: `defineConfig`, `env`
- **Advanced**: `SqliteAdapter` (optional)

Removed internal helpers from public surface.

### Why

**Clear Surface**:
- New users see exactly what they need
- No confusion about which exports are "real" vs internal
- Mirrors professional ORMs' documented APIs

**Growth Path**:
- Public API can expand without breaking changes
- Internal details can refactor freely
- Semantic versioning becomes meaningful

---

## 4. What We Intentionally Did NOT Add

### 1. Migrations System

**Why Not**:
- Migrations are complex (versioning, rollbacks, conflict resolution)
- SQLite doesn't need them as much as PostgreSQL
- `synchronize: true` works fine for learning
- Production users should use Prisma or TypeORM for this

**Trade-off**: 
- Simpler codebase (learning focused)
- Clear "this is where production ORMs differentiate"

### 2. Relationship/Join Logic

**Why Not**:
- Foreign keys and joins are a full subsystem
- Single-table queries are enough to learn the core patterns
- Adds significant complexity
- Distracts from Data Mapper + Unit of Work lessons

**Learning Reason**:
- Relationships are a **separate concern** from CRUD operations
- The current library teaches: decorators, metadata, repositories, transactions
- That's already substantial

### 3. Multi-Database Support

**Why Not**:
- Prisma/TypeORM support many databases (+ overhead)
- query-builder-wrapper is SQLite-focused *by design*
- That's where the learning value is: deep dive into one database

**Trade-off**:
- Simpler abstraction (only SQLite concerns)
- Clearer mental model (no adapter registry, no dialect logic)
- Still demonstrates the principle: adapters can exist

### 4. Connection Pooling or Caching

**Why Not**:
- better-sqlite3 handles single-threaded apps efficiently
- Pooling is for high-concurrency scenarios
- Adds operational complexity (pool exhaustion, timeout tuning)
- Out of scope for learning

**Trade-off**:
- Simpler API
- Suitable for: Electron apps, CLI tools, small web servers
- Not suitable for: high-concurrency REST APIs (use professional ORMs there)

### 5. Complex Query Builders (Filtering, Aggregations)

**Why Not**:
- Query builder is a large subsystem (think: Knex, SQLAlchemy)
- The library currently does simple WHERE clauses
- That's enough to teach the principles
- Complex queries are better handled by SQL or professional ORMs

**Trade-off**:
- Limited query expressiveness
- Scope stays manageable
- Clear boundary: "this teaches ORM fundamentals, not query builder design"

---

## 5. File Structure

### Before

```
src/
├── types.ts
├── decorators.ts
├── repository.ts
├── entity-manager.ts
├── data-source.ts
├── sqlite-dialect.ts
├── type-guards.ts
└── index.ts
```

### After

```
src/
├── adapter.ts              ← NEW: Database abstraction
├── config.ts               ← NEW: Config helpers + validation
├── types.ts
├── decorators.ts
├── repository.ts
├── entity-manager.ts
├── data-source.ts
├── sqlite-dialect.ts       ← Unchanged (internal)
├── type-guards.ts          ← Unchanged (internal)
└── index.ts                ← Updated exports

.env.example               ← NEW: Template for configuration
orm.config.example.ts      ← NEW: Example config file
```

### Rationale

- **Adapter isolation**: Database logic is clearly separated
- **Config helpers**: Single source of truth for initialization
- **Example files**: Users have concrete templates
- **Minimal new code**: Only ~200 lines of new functionality

---

## 6. Dependency Injection Pattern

### Decision

`DataSource` creates `EntityManager`, which caches `Repository` instances.

### Why

**Simplicity**:
- Users only construct `DataSource`, everything else flows from it
- No need for a DI container (like TypeORM's Container)
- Matches `DataSource` pattern in TypeORM

**Trade-off**:
- Tightly couples EntityManager and DataSource
- But that's okay: they always work together
- Loose coupling ≠ always good; tight coupling is fine when coupling is *inevitable*

---

## Learning Journey

This structure supports a **learning progression**:

1. **Beginner**: Define entities with decorators, use repositories
   ```typescript
   @Entity('users')
   class User { @Column() id: number }
   
   const users = repo.findBy({ active: true })
   ```

2. **Intermediate**: Transactions and Unit of Work
   ```typescript
   manager.transaction((mgr) => {
     mgr.getRepository(User).save(user)
     mgr.getRepository(Post).save(post)
   })
   ```

3. **Advanced**: Understand the adapter, reflection, metadata
   ```typescript
   const adapter = new SqliteAdapter({ filename: 'app.db' })
   // How does the adapter fit? Why is it useful?
   ```

4. **Professional Context**: "Now read Prisma or TypeORM source—you understand the fundamentals"

---

## Summary

| Pattern | Adopted? | Why | Cost |
|---------|----------|-----|------|
| **Adapter abstraction** | ✅ | Professional pattern; enables testing | ~100 LOC |
| **Config helpers** | ✅ | Familiar to Prisma users; explicit | ~70 LOC |
| **Separation of concerns** | ✅ | Improves readability; enables growth | Existing |
| **Type safety** | ✅ | Core to learning TypeScript + ORMs | Existing |
| **Migrations** | ❌ | Out of scope; production concern | None |
| **Relationships** | ❌ | Too complex; teaches different topic | None |
| **Multi-DB** | ❌ | SQLite focus is the learning point | None |
| **Pooling/Caching** | ❌ | Unnecessary for learning; adds complexity | None |

**Result**: ~170 lines of new code, significant architectural improvements, maintained learning focus.
