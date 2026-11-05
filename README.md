# Ayyappan Finance

Private finance workspace backed by Supabase Postgres through Prisma. The browser talks to the local Node server; the database connection string stays in the server's environment.

## Run locally

From the finance folder:

1. Put your Supabase Session pooler PostgreSQL URL in .env as DATABASE_URL=...
2. Run npm install, then npm run db:deploy.
3. Run npm run dev and open the URL printed in the terminal. The default is http://127.0.0.1:3000. To use port 3300 in PowerShell, run $env:PORT=3300 before npm run dev.
4. On a new empty database, create the administrator login in the app.

The .env file is ignored by Git. Use the database connection string, not the Supabase anon or service role key.

## Daily collection workflow

The Finance dashboard opens after sign in. It shows every self-managed loan installment scheduled for today, including those already checked. Choose **Paid** after receiving the money; the app records a confirmed receipt for that installment's remaining balance. Choose **Not paid** to leave the balance open; selecting it after a checklist payment reverses that receipt and reopens the balance. The same status choices appear in each self-managed loan's installment schedule for installments due today or earlier. There is no separate borrower payment form. The dashboard also shows upcoming and overdue installments.

The site has no cheque entry, cheque status, or cheque report workflow. New records can be entered through the app. The old SQLite database is kept locally as a historical backup; this build does not import it.

## Development commands

npm run dev starts the watched local server. npm start runs the normal local server. npm run db:deploy applies committed Prisma migrations, and npm run db:generate regenerates the Prisma client after schema changes. npm run typecheck checks TypeScript, npm test runs calculation tests, and npm run test:postgres checks the Supabase finance and daily checklist flow inside a transaction that rolls back its synthetic records.

Prisma schema: prisma/schema.prisma. Migrations: prisma/migrations. The generated client is excluded from Git and rebuilt during npm install.

## Deployment status

This is a local application bound to 127.0.0.1. Supabase stores the records but does not replace the app's sign in or make the Node server ready for public hosting. Public deployment still needs HTTPS, staff roles and MFA, a hosted security review, and a backup and restore procedure. The previous SQLite implementation remains in the repository as a legacy reference; its backup scripts do not back up Supabase.
