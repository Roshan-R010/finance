# Ayyappan Finance

Private finance workspace backed by Supabase Postgres through Prisma. The browser talks to the local Node server; the database connection string stays in the server's environment.

## Run locally

From the finance folder:

1. Put your Supabase Session pooler PostgreSQL URL in .env as DATABASE_URL=...
2. Run npm install, then npm run db:deploy.
3. Run npm run dev and open the URL printed in the terminal. The default is http://127.0.0.1:3000. To use port 3300 in PowerShell, run $env:PORT=3300 before npm run dev.
4. On a new empty database, create the administrator login in the app.

The .env file is ignored by Git. Use the database connection string, not the Supabase anon or service role key.

## Daily cheque workflow

The Business Dashboard shows four live summaries for Ayyappan-managed solo and joint loans: today's scheduled cheques, yesterday's unverified bank results, bounced or older unresolved cheques, and the next seven days. Each card opens its filtered list. Externally managed investments do not appear in these operational counts.

Each open self-managed installment has one installment-backed scheduled cheque record. This V1 record does not prove a physical cheque was presented or deposited; deposit status is not tracked. Today's Cheques is a read-only deposit worklist with an A4 PDF. Yesterday's Cheques lets the signed-in operator confirm a bank result as Passed or Bounced; older pending records remain accessible. Passed creates one confirmed receipt and reduces the loan balance. Bounced leaves the balance open. Confirmed results cannot be silently reversed; no correction UI is available yet. The loan detail page shows receipt history and each contributor's proportional share of confirmed collections, separately from expected profit.

Existing confirmed payments were preserved by the migration and were not inferred to be Passed bank results. Only still-open self-managed installments received scheduled cheque records during backfill. The old SQLite database remains a historical local backup and is not imported by this build.

## Development commands

npm run dev starts the watched local server. npm start runs the normal local server. npm run db:deploy applies committed Prisma migrations, and npm run db:generate regenerates the Prisma client after schema changes. npm run typecheck checks TypeScript, npm test runs calculation tests, and npm run test:postgres checks cheque metrics, PDF totals, and bank-result accounting inside a transaction that rolls back its synthetic records.

Prisma schema: prisma/schema.prisma. Migrations: prisma/migrations. The generated client is excluded from Git and rebuilt during npm install.

## Deployment status

This is a local application bound to 127.0.0.1. Supabase stores the records but does not replace the app's sign in or make the Node server ready for public hosting. Public deployment still needs HTTPS, staff roles and MFA, a hosted security review, and a backup and restore procedure. The previous SQLite implementation remains in the repository as a legacy reference; its backup scripts do not back up Supabase.
