# Mad River Cleaning Co. Source Recovery

This archive is the editable application source, not just a screenshot or compiled website. Keep a downloaded copy on your own computer and a second copy in storage you control; a private Git repository is recommended for ongoing version history.

## Included

- React/TypeScript frontend and public logo assets.
- Express backend, authentication, invoices, and payment/email adapters.
- Database schema baseline and additive migrations.
- Dependency versions in `package-lock.json`, build configuration, and tests.
- Environment-variable template and billing handoff.

## Deliberately excluded

Actual customer/property/invoice records, database files, passwords, setup codes, provider secrets, dependency folders, and disposable test data are not in this source archive. Restore business records separately from a database backup; source code alone cannot recreate them.

## Recover the app

Use a current compatible Node.js installation (Node 22 LTS is a suitable starting point), then open a terminal in the extracted project folder. Install dependencies and build:

```sh
npm ci
npm run check
npm run build
```

If restoring an existing business database, place its backed-up `data.db` in the project root or configure `DATABASE_PATH` to point to it. Starting the app applies the additive migrations automatically; do not run a destructive database reset.

For an entirely empty installation only, initialize its tables:

```sh
npx tsx script/init-empty-database.ts
```

That command refuses to run on a database which already has tables. It creates no demo records and no user accounts.

Set the server environment using `.env.example` as a reference. For a fresh local workspace, `npx tsx script/prepare-preview.ts` creates a server bootstrap digest and a separate private setup-code file; the generated file's preview link refers to the original Computer preview, so open your own host instead.

Start the built app:

```sh
npm start
```

Open your server on port 5000, create the first account using the private setup code, and review Settings. Stripe and invoice email stay disabled until configured; secrets must remain server-side.

## Hosting outside Computer

The source can be built and run on another compatible Node host with persistent database storage. For a direct Express host, the existing `__PORT_5000__` placeholder falls back to same-origin API requests in the local build; Perplexity rewrites that placeholder only when deploying through its hosting tools.

Take an independent database backup before changing hosts or versions. Test the restored app and records before retiring the old installation, and do not assume a published URL or conversation is a substitute for downloaded source and backups.

The older README and schema notes describe the original app. Use `BILLING-UPGRADE.md` for the newer billing, authentication, and payment architecture.
