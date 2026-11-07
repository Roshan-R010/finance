# Supabase PostgreSQL backup and migration verification

The old `scripts/backup.ts` and `scripts/restore-verify.ts` operate on SQLite. They do not protect the Supabase PostgreSQL database. This application stores its tables, including users, audit history, `cash_cutover`, `cash_movements`, and `cash_allocations`, in the `public` schema.

## Back up the application data

Install PostgreSQL client tools (`pg_dump` and `pg_restore`) with a major version at least as new as the Supabase database. Keep the `.env` file and backup archives outside Git. Use a protected folder and an encrypted off-site copy. Supabase's [Database Backups](https://supabase.com/docs/guides/platform/backups) page explains the plan's managed backup retention; a local logical backup gives you a separate export you can inspect.

In PowerShell, from `finance`, load the Session pooler `DATABASE_URL` into the current process without printing it. Then run:

```powershell
$databaseUri = [uri]$env:DATABASE_URL
$userParts = $databaseUri.UserInfo.Split(':', 2)
$env:PGPASSWORD = [uri]::UnescapeDataString($userParts[1])
$env:PGSSLMODE = 'require'
$backupFile = Join-Path $env:USERPROFILE ('finfam-public-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
try {
  pg_dump --host $databaseUri.Host --port $databaseUri.Port --username ([uri]::UnescapeDataString($userParts[0])) --dbname $databaseUri.AbsolutePath.TrimStart('/') --schema public --format custom --no-owner --no-acl --file $backupFile
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  pg_restore --list $backupFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Backup archive is unreadable' }
  Write-Output "Backup archive created: $backupFile"
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}
```

The connection string must already be set in the environment; do not paste a password into a command or chat. An archive-list check verifies that the file is readable, but **a restore to an empty, separate database is the real backup test**. Restore there using `pg_restore --no-owner --no-acl --dbname <test-connection> <backup-file>`, then compare table counts for `accounts`, `contributions`, `installments`, `cheques`, `receipts`, and `audit_events` with the source. Never restore into the active Supabase database to test a backup.

## Verify migrations before any active schema change

1. Create an empty **separate** PostgreSQL test database, preferably a disposable local instance or a separate Supabase project. Do not use another schema in the active database as the test target.
2. Set `DATABASE_URL` in a fresh terminal to the test database URL. Check its host and database name before running a command.
3. Run `npx prisma migrate deploy`, then `npx prisma migrate status` against the test database.
4. Run `npx prisma validate` and `npm run typecheck`; inspect the resulting tables and constraints. Set `TEST_DATABASE_URL` to this test database URL and run `npm run test:postgres`. The command refuses to run if `TEST_DATABASE_URL` matches the active database.
5. Before any migration on the active database, make a fresh backup and successfully restore it to a separate database. Review the migration SQL and a table-count snapshot. Apply only a verified migration with `npm run db:deploy`.

**Current release:** `20261107_cash_tracking` adds three tables and `20261107_cash_tracking_rls` enables row-level security on them. They do not drop or alter existing finance tables. Their SQL was verified in a rolled-back isolated schema on the active Supabase server, then applied to `public`. This is narrower than a restore and full migration replay in a separate database. No `pg_dump` archive or separate restore was made for this sample-data change. The historical migration folders still sort differently from their dependency order (`init`, daily installments, cheque workflow, directory), so a fresh database deployment remains unverified. Do not run `prisma migrate reset` or `prisma db push` against Supabase.
