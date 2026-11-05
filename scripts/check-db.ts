import 'dotenv/config';
import { db, one, all } from '../src/prisma-db.ts';

async function main() {
  try {
    const userCount = await one(db, 'SELECT COUNT(*) as c FROM users');
    console.log('User count:', userCount);
    const parties = await all(db, 'SELECT id, name, kind, roles FROM parties');
    console.log('Parties:', parties);
    const accountCount = await one(db, 'SELECT COUNT(*) as c FROM accounts');
    console.log('Account count:', accountCount);
  } catch (err) {
    console.error('Error connecting to DB:', err);
  } finally {
    await db.$disconnect();
  }
}

main();
