# Ayyappan Finance

Private finance workspace backed by Supabase Postgres through Prisma. The browser talks to the local Node server; the database connection string stays in the server's environment.

## Run locally

From the finance folder:

1. Put your Supabase Session pooler PostgreSQL URL in .env as DATABASE_URL=...
2. Run npm install. For an existing provisioned database, check migration status before `npm run db:deploy`. Fresh database setup is paused until the historical migration order is replayed successfully in a separate test database; see the backup and migration guide below.
3. Run npm run dev and open the URL printed in the terminal. The default is http://127.0.0.1:3000. To use port 3300 in PowerShell, run $env:PORT=3300 before npm run dev.
4. On a new empty database, create the administrator login in the app.

The .env file is ignored by Git. Use the database connection string, not the Supabase anon or service role key.

The external investment Through choices use registered directory IDs. The existing Ganesh and True Finance IDs are configured in `src/external-managers.ts`; set `FINFAM_GANESH_MANAGER_ID` and `FINFAM_TRUE_FINANCE_MANAGER_ID` in `.env` when using a different database. Ganesh records Ayyappan's stake only. True Finance records the Ayyappan-responsible pool and can optionally include Ganesh as a contributor.

## Cash tracking

The Business Dashboard shows available cash held for lending. The Personal Finance Dashboard shows Ayyappan's available cash, offers Add Fund, and lists cash activity. Balances come from cash movements with separate ownership and custody allocations in integer paise. Saving a loan records its net cash outflow; confirmed Passed results and recorded external returns add cash. Bounced and scheduled cheques do not. Joint loans ask how each partner paid, so direct payments do not appear as cash held by Ayyappan. External returns have a Record Return form on the investment details page.

Cash tracking starts with a one-time opening position. Existing earlier loan events are not replayed into it. The current database contains six **sample** loans and a sample opening balance for design testing; these values are not business records. `node scripts/seed-design-cash.ts --replace-test-records` replaces finance records and cash activity but keeps the login. Run it only when replacing the sample set is intended.

## Borrowers and loan contacts

The Borrowers & Partners directory has one Borrowers list for companies and individuals. Enter a company's name directly as the borrower; no separate organisation record or person is required. Existing directory records and loan links remain available. Add Loan and Edit Loan accept an optional contact person's name, stored with that loan and shown on its details page. Contacts do not change the borrower, financial calculations, cheque worklists, or PDF report names.

## Daily cheque workflow

The Business Dashboard shows four live summaries for Ayyappan-managed solo and joint loans: today's scheduled cheques, yesterday's unverified bank results, bounced or older unresolved cheques, and the next seven days. Each card opens its filtered list. Externally managed investments do not appear in these operational counts.

Each open self-managed installment has one installment-backed scheduled cheque record. This V1 record does not prove a physical cheque was presented or deposited; deposit status is not tracked. Today's Cheques is a read-only deposit worklist with an A4 PDF. Yesterday's Cheques lets the signed-in operator confirm a bank result as Passed or Bounced; older pending records remain accessible. Passed creates one confirmed receipt and reduces the loan balance. Bounced leaves the balance open. Confirmed results cannot be silently reversed; no correction UI is available yet. The loan detail page shows receipt history and each contributor's proportional share of confirmed collections, separately from expected profit.

Existing confirmed payments were preserved by the migration and were not inferred to be Passed bank results. Only still-open self-managed installments received scheduled cheque records during backfill. The old SQLite database remains a historical local backup and is not imported by this build.

## Development commands

npm run dev starts the watched local server. npm start runs the normal local server. npm run db:deploy applies committed Prisma migrations, and npm run db:generate regenerates the Prisma client after schema changes. npm run typecheck checks TypeScript, and npm test runs local calculation and UI tests. npm run test:postgres requires a separate TEST_DATABASE_URL; npm run test:postgres:current runs rollback-based tests against DATABASE_URL when the current database has been explicitly approved for testing. `node scripts/verify-cash-migration.ts` verifies the cash migration in a rolled-back schema on the current PostgreSQL server; it does not prove full fresh migration replay.

Prisma schema: prisma/schema.prisma. Migrations: prisma/migrations. The generated client is excluded from Git and rebuilt during npm install.

## Deployment status

This is a local application bound to 127.0.0.1. Supabase stores the records but does not replace the app's sign in or make the Node server ready for public hosting. Public deployment still needs HTTPS, staff roles and MFA, and a hosted security review. Follow [PostgreSQL backup and migration verification](docs/postgres-backup-and-migrations.md) before applying future database changes. The previous SQLite implementation remains in the repository as a legacy reference; its backup scripts do not back up Supabase.
