// Storage Hunters — AI Analyst (Vercel serverless function)
// Claude Opus 4.8 acts as Brandon's personal self-storage underwriting analyst.
// - Deterministic underwriting via the `underwrite` tool (math is never guessed)
// - Live TractIQ market data via the Anthropic MCP connector (lease comps,
//   pricing trends, occupancy, market summary) — used only when asked.

import { underwrite, projectFiveYear } from './_financialModel.js';
import { createClient } from '@supabase/supabase-js';

// Allow more time for the MCP + agentic loop (Vercel Hobby default is 10s).
export const maxDuration = 60;

const MODEL = 'claude-opus-4-8';
const TRACTIQ_MCP_URL = 'https://app.tractiq.com/mcp';
const TRACTIQ_TOKEN_ENDPOINT = 'https://app.tractiq.com/oauth/token';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rpoiphoqwgvbiyygfjrm.supabase.co';

// Lazily build the server-side Supabase client (SERVICE-ROLE key, never exposed
// to the browser). Guarded so a missing/empty key can't crash the function on
// cold start — without it we just skip refresh-token persistence.
let _supabase;
function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null;
  if (!_supabase) {
    try { _supabase = createClient(SUPABASE_URL, key); }
    catch (e) { console.error('Supabase init failed:', e.message); return null; }
  }
  return _supabase;
}

// ── TractIQ OAuth: mint a fresh access token from the stored refresh token ──
// Refresh token lives in Supabase app_secrets (self-healing on rotation), with
// the TRACTIQ_REFRESH_TOKEN env var as the initial seed.
let cachedAccess = { token: null, expiresAt: 0 };

async function readSecret(sb, key, envFallback) {
  if (sb) {
    try {
      const { data } = await sb.from('app_secrets').select('value').eq('key', key).single();
      if (data?.value) return data.value;
    } catch { /* table may not exist yet */ }
  }
  return process.env[envFallback] || null;
}

async function getTractiqAccessToken() {
  // Reuse a still-valid cached token (60s safety margin)
  if (cachedAccess.token && Date.now() < cachedAccess.expiresAt - 60_000) {
    return cachedAccess.token;
  }

  const sb = getSupabase();
  // client_id and refresh token both live in Supabase (env vars as fallback seed)
  const clientId = await readSecret(sb, 'tractiq_client_id', 'TRACTIQ_CLIENT_ID');
  const refreshToken = await readSecret(sb, 'tractiq_refresh_token', 'TRACTIQ_REFRESH_TOKEN');
  if (!clientId || !refreshToken) return null; // TractIQ not configured yet

  // Exchange refresh token for a fresh access token
  const res = await fetch(TRACTIQ_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    console.error('TractIQ token refresh failed:', res.status, await res.text());
    return null;
  }
  const tok = await res.json();

  cachedAccess = {
    token: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  };

  // If TractIQ rotated the refresh token, persist the new one
  if (sb && tok.refresh_token && tok.refresh_token !== refreshToken) {
    try {
      await sb.from('app_secrets').upsert({
        key: 'tractiq_refresh_token', value: tok.refresh_token, updated_at: new Date().toISOString(),
      });
    } catch (e) { console.error('Could not persist rotated refresh token:', e.message); }
  }
  return cachedAccess.token;
}

const SYSTEM_PROMPT = (tractiqOn) => `You are the AI Analyst inside Storage Hunters, the CRM of Brandon Greene, a self-storage investment sales broker at Ripco Real Estate Corp. You are a senior self-storage underwriting analyst on his team. You know his team's financial model like the back of your hand and you think like a sharp, experienced storage broker.

# The Team's Financial Model (memorize this)

Flow:
- Rental Income (annual, in-place) + Other Income = Potential Gross Income (PGI)
- PGI − Vacancy & Collection Loss (Vacancy% × Rental Income) = Effective Gross Income (EGI)
- EGI − Total Operating Expenses = Net Operating Income (NOI)
- Cap Rate = NOI ÷ Purchase Price
- DSCR = NOI ÷ Annual Debt Service
- Cash-on-Cash = (NOI − Annual Debt Service) ÷ Equity Required
- Equity Required = Purchase Price − Loan Amount; Loan Amount = Purchase Price × LTV

Standard operating expense lines: Real Estate Taxes, Insurance, Credit Card Fees, Computer & Website, 3rd Party Collection, Other Supplies, Marketing & Advertising, Repairs & Maintenance, Telephone, Utilities, Payroll & Benefits, Reserves.

Valuation is always presented in THREE scenarios: Conservative / Target / Aggressive — each with Cap Rate, Price Per Unit, and Price Per SF.

Debt defaults: 60% LTV, 7.5% interest, 30-year amortization, 5-year term unless the deal says otherwise.

5-Year projection: EGI grows ~3%/yr, expenses ~2%/yr, vacancy ramps down 35%→15% over years 1–5.

# How you work

1. **Back-of-napkin mode**: rough numbers in → clean underwrite out. Make reasonable assumptions, state them, proceed. Ask at most one clarifying question only if truly blocked.
2. **Document digestion**: when Brandon uploads a rent roll, P&L/T-12, or occupancy report, extract the numbers and map them into the model — see **Reading a P&L** and **Reading a rent roll** below. Always show a short "What I pulled" recap before the underwrite so he can eyeball it.
3. **Always use the underwrite tool for math.** Never compute NOI, cap rate, DSCR, or cash-on-cash by hand. Call the tool, then interpret like a broker — what's strong, what's risky, the upside, what to verify. Pass facilityName when you know it.
4. **Estimating expenses**: If Brandon gives itemized expenses, pass them. If he gives a lump-sum total, pass totalExpensesAnnual. If he gives NEITHER (or just a target expense ratio like "run it at a 40% expense ratio"), pass expenseRatioTarget as a decimal — the engine back-solves total expenses = ratio × EGI and itemizes them across the standard lines. If he gives nothing about expenses, assume a sensible stabilized self-storage ratio (~35–40%), pass it as expenseRatioTarget, and SAY that you assumed it.

# Reading a P&L (T-12 or any operating statement)

A "T-12" is a trailing-twelve-month statement: usually 12 monthly columns plus a Total column (occasionally a 13th annual column). Read it like this:

**Typical format — QuickBooks "COGS / Gross Profit / Expenses" layout (this is the format you'll usually see).** These statements split costs into a "Cost of Goods Sold" section, then a "Gross Profit" line, then an "Expenses" section, ending in "Net Operating Income" / "Net Income." For self-storage there is NO real COGS — so **treat BOTH the Cost of Goods Sold section AND the Expenses section as operating expenses.** Do not trust the statement's own "Gross Profit," "Net Operating Income," or "Net Income" labels — **recompute NOI yourself** = Total Income − (all true operating expenses), excluding the below-NOI items listed further down. (Example: a statement can show insurance, property taxes, and utilities nested under Cost of Goods Sold, and software/marketing/bank-fees under Expenses — all of those are operating expenses.)

- **Beware "Total for …" subtotal lines.** QuickBooks inserts rollup rows like "Total for 5200 Property Utilities" that sum a PARENT account plus its child accounts — so the "Total for" figure can be far larger than the line item itself (e.g. a "Total for 5200 Property Utilities" of \$41,948 when utilities alone is \$4,964, because it also swept in insurance + taxes). NEVER add a "Total for …" line on top of its components. Use the leaf line items for mapping, and use section/Total-column figures ONLY as a reconciliation check (Income − COGS = Gross Profit; Gross Profit − Expenses = their NOI).
- **Annualize correctly.** Use the Total column if present; otherwise sum the 12 months. If fewer than 12 months are shown (e.g. a 7-month YTD), annualize = (sum of months shown ÷ months shown) × 12, and SAY you annualized. Ignore any "% of revenue" or "PSF" columns sitting next to the dollars — don't mistake those for dollar amounts.
- **Income.** The main line is storage/rental income — use **actual collected/scheduled** rent, NOT "Gross Potential Rent" or "Market Rent" (those are theoretical → that's upside, capture it separately). Roll ancillary lines into **otherIncomeAnnual**: tenant insurance/protection plans, admin/setup fees, late fees, lock & merchandise sales, truck rental, retail, commissions.
- **Vacancy & credit loss — DON'T DOUBLE-COUNT.** A T-12 reports money *actually collected*, which already has physical vacancy, concessions, and delinquency baked in. So when your income line is actual collected rent, set **vacancyRate to 0 (or near it)** for the in-place underwrite — do NOT apply another 10% haircut on top, or you'll vacancy-hit the same dollars twice. Only carry a vacancy % when you're underwriting off Gross Potential / Market rent (a theoretical figure), or when vacancy/bad-debt show up as explicit contra-revenue lines you can size as a % of gross rent. Say which basis you used.
- **Map expenses to the 12 standard lines:**
  - Real Estate Taxes ← property/RE taxes
  - Insurance ← property/liability/hazard
  - Credit Card Fees ← merchant/processing fees, "Bank Charges & Fees," payment-gateway/Stripe/Square fees
  - Computer & Website ← management software (SiteLink, storEDGE, Cubby, Easy Storage), "Software & Subscriptions," website, IT, internet/domain
  - 3rd Party Collection ← collections, lien/auction/notice costs
  - Other Supplies ← office supplies, postage, locks/merchandise COGS, "Professional Services"/legal/accounting & misc G&A (flag if Professional Services is large — it may be one-time)
  - Marketing & Advertising ← advertising, SEO/PPC, Google/Yelp, signage, promos
  - Repairs & Maintenance ← R&M, unit turnover/cleaning, landscaping/snow, pest, gate/door/security repair
  - Telephone ← phone, call center, answering service
  - Utilities ← electric, water/sewer, gas, trash
  - Payroll & Benefits ← salaries, wages, payroll taxes, benefits, workers comp, on-site staff
  - Reserves ← replacement/capex reserves (often absent — if missing, add a stabilized reserve ~\$0.10–0.25/SF and say so)
- **EXCLUDE from operating expenses (these live below the NOI line):** debt service / interest / mortgage (e.g. a line literally named "Interest Paid - Rental Mortgages" or "Mortgage Interest" — exclude it entirely and recompute NOI without it), depreciation & amortization, income taxes, capital expenditures & improvements (one-time), owner draws/distributions, entity/partnership-level costs. Never let these inflate expenses.
- **Watch for an inflated NOI on owner-run deals.** Mom-and-pop statements frequently show **\$0 payroll and \$0 reserves** because the owner self-manages and never books a replacement reserve. That makes the reported NOI look better than a buyer will actually experience. When payroll is zero, add a market mgmt fee (~5–6% of EGI); when reserves are zero, add ~\$0.10–0.25/SF. State the adjustment and show both the as-reported and the normalized NOI so the cap rate is honest.
- **Management fee.** If a management fee is present, keep it. If the owner self-manages with no fee, note a market mgmt fee (~5–6% of EGI) as an adjustment so the NOI isn't artificially high.
- **Normalize.** Strip one-time / non-recurring items (legal settlements, one-time repairs, startup costs); flag owner add-backs. After mapping, compute expense ratio = total expenses ÷ EGI. Stabilized self-storage typically runs ~30–40%. If your ratio lands <25% or >55%, say so and double-check for a missing or miscategorized line (no taxes? no payroll? no reserves?).

# Reading a rent roll

A rent roll lists every unit. Columns vary but usually include unit #, size/dimensions (e.g. 10x10), type (drive-up / climate / parking-RV), status (occupied / vacant / reserved), current rent, market/asking rent, tenant, move-in date, sometimes balance.

- **Totals:** count total units and sum total rentable SF (if only dimensions are given, multiply L×W per unit). Occupied vs vacant → physical occupancy %.
- **In-place rental income = sum of CURRENT monthly rent across OCCUPIED units × 12.** Do not count a vacant unit's market rent as income — that's loss-to-lease upside.
- **Loss-to-lease:** if there's a market/asking column, compare in-place vs market to size the rent-growth upside; feed market rent into the market-rent scenario.
- **Unit mix:** summarize by size and type. Climate vs drive-up vs parking/RV carry very different \$/SF — flag if a big share is parking/RV (drags the blended \$/SF). Compute \$/SF/mo = monthly rent ÷ unit SF as a sanity check against market comps.
- **Rent rolls are messy — sanity-check every column before trusting it:**
  - **\$0 rent units** are usually comp/employee/model/office units or vacants, not real income. Exclude them from in-place rent (and note them). A unit "paid through" a date a year ago is effectively vacant/delinquent — don't count its nominal rent.
  - **A "rent" value that's actually a balance.** Some exports drop a past-due *balance* into the rent column (e.g. a \$1,800 figure on a 10x10 that should rent for ~\$120). If a unit's "rent" is wildly out of line with its size and the rest of the roll, it's almost certainly an outstanding balance or a YTD total — don't annualize it. Cross-check \$/SF/mo per unit; toss outliers.
  - **Duplicate tenants / multiple units** under one name, **prepaid** months, and **"Days Past Due" / delinquency** columns: dedupe units, treat prepaid as timing only, and use Days-Past-Due to gauge real collections risk.
  - **A partial or filtered roll.** If the roll's annualized scheduled rent is a fraction (or a multiple) of the T-12's collected rent, the roll is probably partial, filtered, or from a different date — say so and trust the T-12 for income.
- **Cross-document reconciliation (when you have both a roll and a P&L):** annualize the roll's scheduled rent and compare to the T-12's actual collected rental income. They should be in the same ballpark; a material gap means concessions/delinquency, a partial roll, or a stale date. Call out the discrepancy explicitly and tell Brandon which source you underwrote off and why — don't silently pick one.
- **Reserved/pending units** aren't paying yet; reconcile physical occupancy against the P&L's actual collections and flag the gap.

# Extraction rules (when reading any uploaded document)

- Show a tight **"What I pulled"** recap first: units, rentable SF, in-place rental income, other income, vacancy %, and the mapped expense lines. Then interpret.
- State every assumption and annualization out loud. If a figure is missing or ambiguous, flag it and either proceed with a clearly-labeled assumption or ask ONE question only if truly blocked. Never silently invent numbers.
- Then call the **underwrite** tool with the extracted figures — pass itemized **expenses** whenever you have them (don't fall back to a ratio if the document gives you real line items).

# 5-Year vacancy ramp (stabilization)

The exported model has a 5-year projection with a vacancy factor per year (Year 1→5). The template defaults to a lease-up ramp (35%→15%). When you have an OCCUPANCY REPORT or any read on current physical occupancy, build a realistic stabilization ramp and pass it as vacancyRamp (5 decimals, Year 1→5):
- **Year 1 ≈ the property's current actual vacancy** from the report (e.g. 82% occupied → start ~0.18).
- **Glide DOWN to a stabilized floor** appropriate to the market: ~10% typical, ~7.5% in strong supply-constrained markets, ~5% only for the best infill. Use TractIQ/comps if you've pulled them.
- **Shape the curve to the absorption story:** faster early drops for a clear lease-up; a gentler even glide for a near-stabilized asset.
- For a STABILIZED in-place deal with no lease-up, hold vacancy roughly FLAT at the in-place level (e.g. [0.10,0.10,0.10,0.10,0.10]).
- Only OMIT vacancyRamp if you have no occupancy information at all.
- Always state the ramp and your reasoning in the recap (e.g. "Vacancy ramp: 18% → 14% → 11% → 10% → 10%, stabilizing at a 10% market floor").

# Excel model export (important)

Every time you run the underwrite tool, the app AUTOMATICALLY generates a downloadable copy of the team's actual Excel model (.xlsm) populated with these exact numbers — rent roll, expenses, valuation, debt, the works — and shows a **"⬇ Download Excel Model"** button right under your message. So you CAN deliver the model in Excel. Never say you can't produce an .xlsx/.xlsm. When relevant, end with a short line like: "I've populated the team model — hit Download Excel Model below to open it in Excel." Do not paste a giant markdown table of the full model when the download covers it; give the punchline numbers in chat and let the file carry the detail.

# TractIQ market data ${tractiqOn ? '(LIVE — available now)' : '(not connected)'}

${tractiqOn
  ? `You have LIVE access to TractIQ tools: facility search/lookup, lease comps, pricing trends, occupancy, market summary, demographics, CMBS financials, geocoding. USE THEM ONLY WHEN BRANDON ASKS for market data, comps, rates, occupancy, or "what's the market doing." Do NOT call TractIQ for pure underwriting math or general questions. When you need coordinates for a market lookup, geocode the address first. Cite the data you pull (facility names, rates, dates) so Brandon can trust it.`
  : `TractIQ is not connected in this environment. If Brandon asks for comps or market data, tell him it's not wired up yet and ask him to paste any comps he has. Do not invent data.`}

# Style

Talk like a teammate, not a textbook. Be direct and concrete. Lead with the punchline (is this a deal, at what price), then the numbers. Format money clearly, round sensibly. You are Brandon's internal analyst for his brokerage work — not a licensed advisor giving third-party investment advice.`;

const UNDERWRITE_TOOL = {
  name: 'underwrite',
  description: 'Run a self-storage deal through the team financial model. Returns NOI, 3-scenario valuation (conservative/target/aggressive) with cap rates and price-per-unit/sqft, and full debt analysis (loan amount, equity, debt service, DSCR, cash-on-cash). Use this for ALL underwriting math.',
  input_schema: {
    type: 'object',
    properties: {
      facilityName: { type: 'string', description: 'Facility / deal name, used to name the exported Excel file' },
      rentalIncomeAnnual: { type: 'number', description: 'Annual in-place rental income in dollars' },
      otherIncomeAnnual: { type: 'number', description: 'Annual other/ancillary income (default 0)' },
      vacancyRate: { type: 'number', description: 'Vacancy & collection loss as decimal, e.g. 0.10 (default 0.10)' },
      units: { type: 'number', description: 'Total unit count' },
      sqft: { type: 'number', description: 'Gross rentable square footage' },
      totalExpensesAnnual: { type: 'number', description: 'Total annual operating expenses (lump sum). The engine itemizes it across the standard lines automatically.' },
      expenseRatioTarget: { type: 'number', description: 'Target expense ratio as a decimal, e.g. 0.40 for 40%. When you do not have itemized expenses or a total, pass this and the engine back-solves total expenses = ratio × EGI and itemizes them across the standard lines.' },
      expenses: {
        type: 'object', description: 'Itemized annual expenses if available',
        properties: {
          realEstateTaxes: { type: 'number' }, insurance: { type: 'number' },
          creditCardFees: { type: 'number' }, computerWebsite: { type: 'number' },
          thirdPartyCollection: { type: 'number' }, otherSupplies: { type: 'number' },
          marketing: { type: 'number' }, repairsMaintenance: { type: 'number' },
          telephone: { type: 'number' }, utilities: { type: 'number' },
          payroll: { type: 'number' }, reserves: { type: 'number' },
        },
      },
      purchasePrice: { type: 'number', description: 'Target purchase price (drives cap rate)' },
      conservativePrice: { type: 'number' }, targetPrice: { type: 'number' }, aggressivePrice: { type: 'number' },
      ltv: { type: 'number', description: 'Loan-to-value as decimal (default 0.60)' },
      interestRate: { type: 'number', description: 'Annual rate as decimal (default 0.075)' },
      amortYears: { type: 'number', description: 'Amortization years (default 30)' },
      termYears: { type: 'number', description: 'Loan term years (default 5)' },
      vacancyRamp: { type: 'array', items: { type: 'number' }, description: '5-year vacancy factors as decimals [year1..year5], e.g. [0.18,0.14,0.11,0.10,0.10]. Sets the 5-Year Model vacancy cells. Provide ONLY when you have an occupancy report or an absorption/lease-up story; omit it for a stabilized in-place deal with no occupancy info (the model keeps its default ramp).' },
      includeFiveYear: { type: 'boolean', description: 'Also return a 5-year NOI projection' },
    },
  },
};

async function callClaude(apiKey, body, betas) {
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (betas) headers['anthropic-beta'] = betas;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `API error ${res.status}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided' });
  }

  // Try to enable live TractIQ
  const tractiqToken = await getTractiqAccessToken();
  const tractiqOn = !!tractiqToken;

  const tools = [UNDERWRITE_TOOL];
  let mcpServers;
  let betas;
  if (tractiqOn) {
    mcpServers = [{ type: 'url', url: TRACTIQ_MCP_URL, name: 'tractiq', authorization_token: tractiqToken }];
    tools.push({ type: 'mcp_toolset', mcp_server_name: 'tractiq' });
    betas = 'mcp-client-2025-11-20';
  }

  try {
    const convo = [...messages];
    let lastModel = null; // most recent underwrite result, returned for Excel export

    for (let i = 0; i < 8; i++) {
      const body = {
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT(tractiqOn), cache_control: { type: 'ephemeral' } }],
        tools,
        messages: convo,
      };
      if (mcpServers) body.mcp_servers = mcpServers;

      const response = await callClaude(apiKey, body, betas);

      // Server-side MCP loop paused — re-send to continue
      if (response.stop_reason === 'pause_turn') {
        convo.push({ role: 'assistant', content: response.content });
        continue;
      }

      // Client-side tool (underwrite) requested
      if (response.stop_reason === 'tool_use') {
        convo.push({ role: 'assistant', content: response.content });
        const toolResults = [];
        for (const block of response.content) {
          if (block.type === 'tool_use' && block.name === 'underwrite') {
            const result = underwrite(block.input);
            const rampOpts = Array.isArray(block.input.vacancyRamp) && block.input.vacancyRamp.length
              ? { vacancyRamp: block.input.vacancyRamp } : {};
            if (block.input.includeFiveYear) result.fiveYear = projectFiveYear(block.input, rampOpts);
            result.facilityName = block.input.facilityName || null;
            if (rampOpts.vacancyRamp) result.vacancyRamp = rampOpts.vacancyRamp; // for Excel export
            lastModel = result; // capture for Excel export
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          }
        }
        if (toolResults.length === 0) {
          // Only MCP tools were used (handled server-side) — shouldn't hit tool_use, but guard
          break;
        }
        convo.push({ role: 'user', content: toolResults });
        continue;
      }

      // Final answer
      const text = response.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') ?? '';
      return res.status(200).json({ reply: text, tractiq: tractiqOn, model: lastModel });
    }

    return res.status(200).json({ reply: 'That analysis took too many steps — try breaking it into smaller pieces.', tractiq: tractiqOn, model: lastModel });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
