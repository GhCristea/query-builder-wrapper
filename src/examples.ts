/**
 * Learning Examples: Demonstrating the Data Mapper ORM
 *
 * These examples show:
 * 1. Entity definition with decorators
 * 2. DataSource initialization and schema creation
 * 3. Repository CRUD operations
 * 4. Transaction handling (Unit of Work)
 */

import 'reflect-metadata';
import { DataSource, Entity, Column, defineConfig } from './index';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 1. ENTITY DEFINITION
// ============================================================================

/**
 * User entity: Maps to the 'users' table in SQLite.
 * The @Column decorator automatically detects property types
 * (String, Number, Boolean, Date) via emitDecoratorMetadata.
 */
@Entity('users')
class User {
  @Column('user_id', true) // Primary key
  id!: number;

  @Column()
  username!: string;

  @Column()
  email!: string;

  @Column()
  isActive!: boolean;

  @Column()
  createdAt!: string; // ISO string
}

/**
 * Profile entity: Demonstrates multiple entity types.
 * In production, you'd add foreign key support.
 */
@Entity('profiles')
class Profile {
  @Column('profile_id', true)
  id!: number;

  @Column()
  userId!: number;

  @Column()
  bio!: string;
}

// ============================================================================
// 2. EXAMPLE: Setup and CRUD Operations
// ============================================================================

async function exampleCRUD() {
  console.log('\n========== EXAMPLE 1: CRUD Operations ==========');

  // Clean up old database
  const dbPath = path.join(process.cwd(), 'example.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  // Initialize DataSource
  const config = defineConfig({
    dbPath,
    entities: [User, Profile],
    synchronize: true,
    logging: true,
  });

  const dataSource = await DataSource.init(config);

  const userRepo = dataSource.getRepository(User);

  // CREATE: Insert users
  console.log('\n--- CREATE: Inserting users ---');
  const user1 = new User();
  user1.id = 1;
  user1.username = 'alice';
  user1.email = 'alice@example.com';
  user1.isActive = true;
  user1.createdAt = new Date().toISOString();
  userRepo.save(user1);
  console.log('✓ User 1 saved');

  const user2 = new User();
  user2.id = 2;
  user2.username = 'bob';
  user2.email = 'bob@example.com';
  user2.isActive = true;
  user2.createdAt = new Date().toISOString();
  userRepo.save(user2);
  console.log('✓ User 2 saved');

  // READ: Find all users
  console.log('\n--- READ: Find all users ---');
  const allUsers = userRepo.find();
  console.log(`Found ${allUsers.length} users:`);
  allUsers.forEach((u) => {
    console.log(`  - ${u.id}: ${u.username} (${u.email})`);
  });

  // READ: Find by criteria
  console.log('\n--- READ: Find active users ---');
  const activeUsers = userRepo.findBy({ isActive: true });
  console.log(`Found ${activeUsers.length} active users`);

  // READ: Find one
  console.log('\n--- READ: Find one user ---');
  const found = userRepo.findOneBy({ username: 'alice' });
  if (found) {
    console.log(`Found: ${found.username} - ${found.email}`);
  }

  // READ: Find by ID (new)
  console.log('\n--- READ: Find by ID ---');
  const byId = userRepo.findById(1);
  if (byId) {
    console.log(`Found by ID: ${byId.username}`);
  }

  // UPDATE
  console.log('\n--- UPDATE: Deactivate user ---');
  userRepo.update({ id: 2 }, { isActive: false });
  const updated = userRepo.findOneBy({ id: 2 });
  console.log(`Bob is now active: ${updated?.isActive}`);

  // COUNT
  console.log('\n--- COUNT: Total users ---');
  const count = userRepo.count();
  console.log(`Total: ${count} users`);

  // DELETE
  console.log('\n--- DELETE: Remove inactive users ---');
  const result = userRepo.delete({ isActive: false });
  console.log(`Deleted ${result.changes} user(s)`);

  const afterDelete = userRepo.find();
  console.log(`Remaining users: ${afterDelete.length}`);

  await dataSource.destroy();
}

// ============================================================================
// 3. EXAMPLE: Transactions (Unit of Work)
// ============================================================================

async function exampleTransaction() {
  console.log('\n========== EXAMPLE 2: Transactions ==========');

  const dbPath = path.join(process.cwd(), 'example-tx.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const config = defineConfig({
    dbPath,
    entities: [User, Profile],
    synchronize: true,
    logging: false,
  });

  const dataSource = await DataSource.init(config);

  // Successful transaction
  console.log('\n--- Successful Transaction ---');
  try {
    dataSource.manager.transaction((manager) => {
      const userRepo = manager.getRepository(User);
      const profileRepo = manager.getRepository(Profile);

      // Create user
      const user = new User();
      user.id = 1;
      user.username = 'charlie';
      user.email = 'charlie@example.com';
      user.isActive = true;
      user.createdAt = new Date().toISOString();
      userRepo.save(user);
      console.log('  ✓ User saved');

      // Create profile
      const profile = new Profile();
      profile.id = 1;
      profile.userId = 1;
      profile.bio = 'Learning TypeScript ORMs';
      profileRepo.save(profile);
      console.log('  ✓ Profile saved');

      return { user, profile };
    });
    console.log('✓ Transaction committed successfully');
  } catch (err) {
    console.error('✗ Transaction failed:', err);
  }

  // Failed transaction (rollback)
  console.log('\n--- Failed Transaction (Rollback) ---');
  try {
    dataSource.manager.transaction((manager) => {
      const userRepo = manager.getRepository(User);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _profileRepo = manager.getRepository(Profile);

      // This will succeed
      const user = new User();
      user.id = 2;
      user.username = 'diana';
      user.email = 'diana@example.com';
      user.isActive = true;
      user.createdAt = new Date().toISOString();
      userRepo.save(user);
      console.log('  ✓ User 2 saved');

      // This will fail (simulate error)
      throw new Error('Intentional error to trigger rollback');
    });
  } catch {
    console.log('  ✗ Error occurred, transaction rolled back');
  }

  // Verify state
  const userRepo = dataSource.getRepository(User);
  const users = userRepo.find();
  console.log(`\nUsers after transaction test: ${users.length}`);
  users.forEach((u) => {
    console.log(`  - ${u.id}: ${u.username}`);
  });

  await dataSource.destroy();
}

// ============================================================================
// 4. ENTRY POINT
// ============================================================================

async function main() {
  console.log(
    '\n╔════════════════════════════════════════════════════════════╗',
  );
  console.log('║        query-builder-wrapper Learning Examples            ║');
  console.log('║      Data Mapper ORM for better-sqlite3                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await exampleCRUD();
    await exampleTransaction();

    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('✓ All examples completed successfully!');
    console.log(
      '═══════════════════════════════════════════════════════════════\n',
    );
  } catch (error) {
    console.error(
      '✗ Error:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

main().catch(console.error);
