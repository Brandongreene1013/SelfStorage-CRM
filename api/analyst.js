// Storage Hero — AI Analyst (Vercel serverless function)
// Claude Opus 4.8 acts as Brandon's personal self-storage underwriting analyst.
// It knows the team's financial model and calls a deterministic `underwrite`
// tool for all math (never does arithmetic itself).

import { underwrite, projectFiveYear } from '../src/data/financialModel.js';

const MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT = `You are the AI Analyst inside Storage Hero, the CRM of Brandon Greene, a self-storage investment sales broker at Ripco Real Estate Corp. You are a senior self-storage underwriting analyst on his team. You know his team's financial model like the back of your hand and you think like a sharp, experienced storage broker.

# The Team's Financial Model (memorize this)

The model flows exactly like this:
- Rental Income (annual, in-place) + Other Income = Potential Gross Income (PGI)
- PGI − Vacancy & Collection Loss (Vacancy% × Rental Income) = Effective Gross Income (EGI)
- EGI − Total Operating Expenses = Net Operating Income (NOI)
- Cap Rate = NOI ÷ Purchase Price
- DSCR = NOI ÷ Annual Debt Service
- Cash-on-Cash = (NOI − Annual Debt Service) ÷ Equity Required
- Equity Required = Purchase Price − Loan Amount; Loan Amount = Purchase Price × LTV

Standard operating expense line items: Real Estate Taxes, Insurance, Credit Card Fees, Computer & Website, 3rd Party Collection, Other Supplies, Marketing & Advertising, Repairs & Maintenance, Telephone, Utilities, Payroll & Benefits, Reserves.

Valuation is always presented in THREE scenarios: Conservative / Target / Aggressive — each with Cap Rate, Price Per Unit, and Price Per SF.

Debt defaults: 60% LTV, 7.5% interest, 30-year amortization, 5-year term (unless the deal says otherwise).

5-Year projection conventions: EGI grows ~3%/yr, expenses grow ~2%/yr, vacancy ramps down over years 1–5 (e.g. 35% → 30% → 25% → 20% → 15%) as a property leases up.

# How you work

1. **Back-of-napkin mode**: When Brandon gives you rough numbers (gross revenue, expenses, units, sq ft, asking price, management structure), run them through the model and give him a clean underwrite. Ask for at most ONE or two missing inputs if truly needed — otherwise make reasonable assumptions, state them clearly, and proceed.

2. **Document digestion mode**: When Brandon uploads a rent roll, P&L, or occupancy report, extract the relevant numbers (rental income, expense line items, unit count, sq ft, occupancy) and map them into the model. Show him what you extracted before/alongside the underwrite so he can sanity-check.

3. **Always use the underwrite tool for math.** Never compute NOI, cap rate, DSCR, or cash-on-cash by hand. Call the tool, then interpret the results like a broker — flag what's strong, what's risky, what the upside is, and what you'd want to verify.

# TractIQ / lease comps

You do NOT have live TractIQ access in this environment yet. If Brandon asks for lease comps or market data, tell him that's coming in a future update and, for now, ask him to paste in any comps he has so you can fold them into the analysis. Do not invent comp data.

# Style

Talk like a teammate, not a textbook. Be direct and concrete. Use Brandon's numbers. When you present an underwrite, lead with the punchline (is this a deal or not, at what price), then the supporting numbers. Format money clearly. Round sensibly. You are not a licensed financial advisor and you don't give personalized investment advice to third parties — but you ARE Brandon's internal analyst helping him underwrite deals for his brokerage work.`;

const TOOLS = [
  {
    name: 'underwrite',
    description: 'Run a self-storage deal through the team financial model. Returns NOI, 3-scenario valuation (conservative/target/aggressive) with cap rates and price-per-unit/sqft, and full debt analysis (loan amount, equity, debt service, DSCR, cash-on-cash). Use this for ALL underwriting math.',
    input_schema: {
      type: 'object',
      properties: {
        rentalIncomeAnnual: { type: 'number', description: 'Annual in-place rental income in dollars' },
        otherIncomeAnnual: { type: 'number', description: 'Annual other/ancillary income in dollars (default 0)' },
        vacancyRate: { type: 'number', description: 'Vacancy & collection loss as a decimal, e.g. 0.10 for 10% (default 0.10)' },
        units: { type: 'number', description: 'Total unit count' },
        sqft: { type: 'number', description: 'Gross rentable square footage' },
        totalExpensesAnnual: { type: 'number', description: 'Total annual operating expenses (use this if you only have a lump sum)' },
        expenses: {
          type: 'object',
          description: 'Itemized annual expenses if available',
          properties: {
            realEstateTaxes: { type: 'number' }, insurance: { type: 'number' },
            creditCardFees: { type: 'number' }, computerWebsite: { type: 'number' },
            thirdPartyCollection: { type: 'number' }, otherSupplies: { type: 'number' },
            marketing: { type: 'number' }, repairsMaintenance: { type: 'number' },
            telephone: { type: 'number' }, utilities: { type: 'number' },
            payroll: { type: 'number' }, reserves: { type: 'number' },
          },
        },
        purchasePrice: { type: 'number', description: 'Target purchase price (drives cap rate). Same as targetPrice.' },
        conservativePrice: { type: 'number', description: 'Optional explicit conservative valuation' },
        targetPrice: { type: 'number', description: 'Optional explicit target valuation' },
        aggressivePrice: { type: 'number', description: 'Optional explicit aggressive valuation' },
        ltv: { type: 'number', description: 'Loan-to-value as decimal (default 0.60)' },
        interestRate: { type: 'number', description: 'Annual interest rate as decimal (default 0.075)' },
        amortYears: { type: 'number', description: 'Amortization period in years (default 30)' },
        termYears: { type: 'number', description: 'Loan term in years (default 5)' },
        includeFiveYear: { type: 'boolean', description: 'Set true to also return a 5-year NOI projection' },
      },
    },
  },
];

async function callClaude(apiKey, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `API error ${res.status}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // messages: full conversation history [{role, content}]
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided' });
  }

  try {
    const convo = [...messages];

    // Agentic loop: let Claude call the underwrite tool, feed results back,
    // continue until it produces a final text answer.
    for (let i = 0; i < 6; i++) {
      const response = await callClaude(apiKey, {
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages: convo,
      });

      if (response.stop_reason === 'tool_use') {
        convo.push({ role: 'assistant', content: response.content });
        const toolResults = [];
        for (const block of response.content) {
          if (block.type === 'tool_use' && block.name === 'underwrite') {
            const result = underwrite(block.input);
            if (block.input.includeFiveYear) {
              result.fiveYear = projectFiveYear(block.input);
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }
        convo.push({ role: 'user', content: toolResults });
        continue;
      }

      // Final answer
      const text = response.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') ?? '';
      return res.status(200).json({ reply: text });
    }

    return res.status(200).json({ reply: 'The analysis took too many steps. Try rephrasing or breaking it into smaller pieces.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
