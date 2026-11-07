import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const active = process.env.DATABASE_URL;
const test = process.env.TEST_DATABASE_URL;
if (!active || !test) throw new Error('Set DATABASE_URL and TEST_DATABASE_URL to different PostgreSQL databases.');
const identity = (value: string) => {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Both URLs must be PostgreSQL connection strings.');
  const username=decodeURIComponent(url.username);
  return { host:url.hostname.toLowerCase(), port:url.port||'5432', database:url.pathname, project:username.startsWith('postgres.')?username.slice('postgres.'.length):'' };
};
const source=identity(active),target=identity(test);
if(source.host===target.host&&source.port===target.port&&source.database===target.database&&(!source.project||!target.project||source.project===target.project))throw new Error('TEST_DATABASE_URL may point to the active database; refusing to run database tests.');

const child = spawnSync(process.execPath, ['--test', 'tests/prisma-smoke.test.ts', 'tests/delete-loan-and-party.test.ts'], {
  env: { ...process.env, DATABASE_URL: test },
  stdio: 'inherit'
});
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
