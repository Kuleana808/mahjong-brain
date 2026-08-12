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

**Not done in this session.** There is no Cloudflare token here and `wrangler` is
not installed, so the deploy has never run. Everything up to `out/` is verified —
the export builds clean and is committed to CI.

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

Deploying is packaging, not a port:

```bash
npx supabase functions deploy api --project-ref <ref>
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
export APPLE_BUNDLE_ID=com.mahjongbrain.game
npm run smoke:events
```

`npx supabase stop` when finished.

### Hosted project

**Not created.** It needs a Supabase account login, which this session does not
have — and creating an account in Brent's name is not something to do on his
behalf. The local stack above exercises the same Postgres, the same PostgREST
API and the same migrations, so what remains untested against hosted Supabase is
networking and key handling, not the schema or the adapters.

When the hosted project exists, the only change is two environment variables.

## Secrets

Nothing is committed. `.env.example` lists every variable and what it gates.
For production these belong in the Cloudflare or Supabase dashboard, never in
the repo:

| Variable | Gates |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | contracts 3, 4, 9, 10, 11, 12. **Service-role bypasses RLS — server-side only, never shipped to a client** |
| `SESSION_SIGNING_KEY` | session tokens |
| `APPLE_BUNDLE_ID` | contract 3's audience check |
| `APPLE_ROOT_CA_G3_BASE64`, `IAP_PRODUCT_ID` | contract 8 |
