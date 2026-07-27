# Sprint 27: Market Intelligence Daily Brief

## Objective
Turn the Dashboard intelligence terminal into a dependable daily broker brief:
fresh CRE, self-storage, private-credit/private-equity, Fed/rates, and
market-specific talking points every day at 6:30 AM Eastern.

## Root Cause Found
- The verified industry RSS registry was empty.
- GDELT was the only non-Fed discovery source and returned repeated 429s,
  timeouts, or empty results in live checks.
- No market-intelligence workflow existed, despite the UI referring to a
  morning schedule.
- Priority markets came from a static list rather than current CRM work.

## What Shipped
- Verified publisher feeds: Inside Self-Storage and Commercial Observer.
- Redundant no-key discovery via Bing News RSS and Google News RSS, with
  publisher attribution, freshness bounds, Bing redirect unwrapping, dedupe,
  and the existing deterministic scoring/AI validation.
- GDELT is opt-in via `ENABLE_GDELT_NEWS=true`, not a production dependency.
- Active-market inference reads live, server-side CRM signals from pipeline
  clients, recent contact activity/callbacks, open tasks, and properties.
- The daily brief receives tagged market evidence and returns sourced
  per-market signals/talking points when strong evidence exists.
- News Radar selection is category-balanced so Fed stories cannot crowd every
  storage/CRE/PE item out of the visible list.
- `.github/workflows/market-intelligence.yml` invokes the protected endpoint at
  6:30 AM America/New_York every day across EDT and EST. Manual dispatch
  forces a complete daily batch.

## Configuration
`MARKET_INTELLIGENCE_SECRET` must match in Vercel Production and GitHub Actions
repository secrets. The workflow fails clearly if the GitHub secret is missing.

## Verification
- Live read-only provider check returned current items in every required
  category.
- Live read-only CRM inference identified current markets from real data.
- `npm run lint`, `npm test`, and `npm run build` pass.
- Tests cover active-market ranking, publisher parsing, and both EDT/EST 6:30
  scheduling.

## Data / Schema
No new migration is required. Active markets and market talking points are
stored inside the existing daily snapshot JSON.

## Protected Areas Not Touched
- Analyst underwriting prompt and deterministic financial model
- Excel export
- TractIQ OAuth/token storage
- Backup encryption
