import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from './generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required. Set it in finance/.env using your Supabase Postgres connection string.');
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
const runtimeUrl = new URL(url);
if (runtimeUrl.searchParams.get('sslmode') === 'require') runtimeUrl.searchParams.set('uselibpqcompat','true');
const adapter = new PrismaPg({ connectionString: runtimeUrl.toString(), max: 5 });
export const db = new PrismaClient({ adapter });
export type DB = typeof db;
const context = new AsyncLocalStorage<any>();
const client = (database: DB) => context.getStore() || database;
const bind = (sql: string) => { let index=0; return sql.replace(/\?/g,()=>`$${++index}`); };
const normalize = (value: any): any => {
  if (typeof value === 'bigint') { if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Database amount exceeds the safe integer range.'); return Number(value); }
  if (value && typeof value === 'object' && typeof value.toNumber === 'function' && Array.isArray(value.d)) { const number=Number(value.toString()); if(!Number.isSafeInteger(number))throw new Error('Database amount exceeds the safe integer range.'); return number; }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)]));
  return value;
};
export async function one(database: DB, sql: string, ...params: any[]): Promise<any> {
  const rows = await client(database).$queryRawUnsafe(bind(sql),...params);
  return normalize(rows[0]);
}
export async function all(database: DB, sql: string, ...params: any[]): Promise<any[]> {
  return normalize(await client(database).$queryRawUnsafe(bind(sql),...params));
}
export async function run(database: DB, sql: string, ...params: any[]) {
  return { changes: await client(database).$executeRawUnsafe(bind(sql),...params) };
}
export async function transaction<T>(database: DB, fn: () => Promise<T>, timeout=30000): Promise<T> {
  if (context.getStore()) return fn();
  return database.$transaction(async tx => context.run(tx,fn),{isolationLevel:'Serializable',maxWait:10000,timeout});
}



