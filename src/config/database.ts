import Database from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'clickdown.db');
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');

// Enable WAL mode for better concurrency
db.exec('PRAGMA journal_mode = WAL');

// Set busy timeout to prevent SQLITE_BUSY errors during parallel/sequential test runs
db.exec('PRAGMA busy_timeout = 5000');

export type { Database };
