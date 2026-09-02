# Deploying

## Marketing site → Cloudflare Pages

The site is a Next.js **static export**, so Pages serves plain HTML from its CDN.
No adapter, no worker, nothing that breaks on a Next major.

```bash
npm run marketing:build                 # → apps/marketing/out/
cd apps/marketing
npx wrangler pages deploy out --project-name=mahjong-brain
```

### One-time setup (needs a Cloudflare account)

1. `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` with the **Cloudflare
   Pages: Edit** permission.
2. Create the project once: `npx wrangler pages project create mahjong-brain
   --production-branch main`.
3. Point the domain at it in the Pages dashboard.

The production site is live at `https://mahjong-brain.pages.dev/`. Its support
and privacy routes returned HTTP 200 on 2026-08-14, including the current Google
Mobile Ads disclosures. See
[`release/RELEASE_STATUS.md`](../release/RELEASE_STATUS.md) for the evidence
ladder and remaining App Store gates.

### Domain

Default is **`mahjongbrain.app`**, with `getmahjongbrain.com` as the fallback.
Nothing is purchased.

Checked 2026-08-11:

| Domain | Status |
|---|---|
| `mahjongbrain.app` | **whois inconclusive** — the `.app` registry restricts it. Needs a registrar lookup; do not assume it is free |
| `getmahjongbrain.com` | available |
| `mahjongbrain.game` | available |
| `mahjongbrain.com` | taken (registered 2026-05-25, Dynadot, serving a 404) |

The site does not hard-code a domain anywhere, so the swap is a DNS change and
one `metadataBase` line.

---

## API → Supabase Edge Functions

`apps/api/src/router.ts` is transport-independent — `handle(request, ports)`
returns an envelope and knows nothing about Node's `http`. The adapters use
`fetch` rather than the Supabase SDK, specifically so they run unchanged inside
an Edge Function.

Build the self-contained Deno module, then deploy it:

```bash
npm run build:edge
npx supabase functions deploy contracts --project-ref <ref>
```

### Local stack

A full local Supabase (Postgres + PostgREST + Auth + Storage) runs in Docker:

```bash
npx supabase start          # applies supabase/migrations/ automatically
npx supabase status         # prints the URL and service_role key
```

Then point the API at it and run the instrumentation smoke test for real:

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
export SESSION_SIGNING_KEY=$(openssl rand -hex 32)
export APPLE_BUNDLE_ID=com.nihi.mahjong
npm run smoke:events
```

`npx supabase stop` when finished.

### Hosted project

The dedicated production project is `Mahjong Brain` (`dxtzbidjtkeekthompqb`) in
the Operator.fyi organization, region `us-west-1`. Migrations 0001 through 0004
and the `contracts` Edge Function were deployed and verified on 2026-08-13.
Credentials are stored in the deployment platform and local Keychain, never in
the repository.

When the hosted project exists, the only change is two environment variables.

The mobile app's public base URL is the deployed function URL:

```bash
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1/contracts
```

Release builds use:

```bash
VITE_API_BASE_URL=https://dxtzbidjtkeekthompqb.supabase.co/functions/v1/contracts
```

Re-run the migration list, contract smoke, and event smoke tests against this
exact project before each production release.

The local release gate does not request or load the hosted service-role key:

```bash
npm run preflight
```

It reads the ignored `.env.production` client values, checks the production
board canary, and proves the deployed StoreKit verifier is configured and fails
closed. Database migration and event smoke evidence remain separate deployment
checks; a passing mobile preflight does not claim a sandbox purchase succeeded.

## Secrets

Nothing is committed. `.env.example` lists every variable and what it gates.
For production these belong in the Cloudflare or Supabase dashboard, never in
the repo:

| Variable | Gates |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | contracts 3, 4, 9, 10, 11, 12. **Service-role bypasses RLS — server-side only, never shipped to a client** |
| `SESSION_SIGNING_KEY` | session tokens |
| `APPLE_BUNDLE_ID` | contract 3's audience check |
| `APPLE_ROOT_CA_G3_BASE64`, `IAP_PRODUCT_IDS` | receipt and consumable verification; include `com.nihi.mahjong.removeads,com.nihi.mahjong.shuffle5` |
