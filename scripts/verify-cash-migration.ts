import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL is required.');
const connection=new URL(url);
if(connection.searchParams.get('sslmode')==='require')connection.searchParams.set('uselibpqcompat','true');
const client=new pg.Client({connectionString:connection.toString(),connectionTimeoutMillis:15000});
const schema='cash_verify_'+randomUUID().replaceAll('-','').slice(0,16);
const migration=await readFile(new URL('../prisma/migrations/20261107_cash_tracking/migration.sql',import.meta.url),'utf8');
const security=await readFile(new URL('../prisma/migrations/20261107_cash_tracking_rls/migration.sql',import.meta.url),'utf8');
await client.connect();
try{
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query('CREATE TABLE parties (id UUID PRIMARY KEY)');
  await client.query(migration);
  await client.query(security);
  const tables=await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name',[schema]);
  const names=tables.rows.map(row=>row.table_name);
  for(const table of ['cash_cutover','cash_movements','cash_allocations'])if(!names.includes(table))throw new Error(`Missing ${table}`);
  const rls=await client.query('SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1::text[]) AND relnamespace=$2::regnamespace',[['cash_cutover','cash_movements','cash_allocations'],schema]);
  if(rls.rows.length!==3||rls.rows.some(row=>!row.relrowsecurity))throw new Error('Cash tables must have row-level security enabled.');
  const owner=randomUUID(),movement=randomUUID();
  await client.query('INSERT INTO parties (id) VALUES ($1)',[owner]);
  await client.query("INSERT INTO cash_cutover (id,started_at,effective_date,actor_id) VALUES (1,'2026-11-07','2026-11-07',$1)",[owner]);
  await client.query("INSERT INTO cash_movements (id,event_key,kind,description,effective_date,managed_in_paise,created_at,actor_id) VALUES ($1,'verify:fund','ADD_FUND','Verification','2026-11-07',10000,'2026-11-07',$2)",[movement,owner]);
  await client.query('INSERT INTO cash_allocations (id,movement_id,party_id,owned_delta_paise,managed_delta_paise) VALUES ($1,$2,$3,10000,10000)',[randomUUID(),movement,owner]);
  const total=await client.query('SELECT SUM(managed_in_paise-managed_out_paise)::bigint AS amount FROM cash_movements');
  if(total.rows[0].amount!=='10000')throw new Error('Cash amount did not reconcile.');
  console.log('Cash migration verified in an isolated, rolled-back schema on Supabase.');
}finally{
  await client.query('ROLLBACK').catch(()=>{});
  await client.end();
}
