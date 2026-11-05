import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(path = process.env.FINFAM_DB_PATH || resolve(process.cwd(), 'data/finance.sqlite')) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const schema = readFileSync(new URL('../db/migrations/002_local_sqlite.sql', import.meta.url), 'utf8');
  db.exec(schema);
  return db;
}

export type DB = ReturnType<typeof openDatabase>;

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function one(db: DB, sql: string, ...params: any[]): any {
  return db.prepare(sql).get(...params);
}

export function all(db: DB, sql: string, ...params: any[]): any[] {
  return db.prepare(sql).all(...params);
}

export function run(db: DB, sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}
