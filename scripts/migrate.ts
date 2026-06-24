import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';

console.log('Running migrations...');
const { applied, skipped } = runMigrations(db);

if (applied.length === 0) {
  console.log('  Database is already up to date.');
} else {
  for (const name of applied) console.log(`  Applied: ${name}`);
}
console.log(`Migrations complete! (${applied.length} applied, ${skipped.length} skipped)`);
