// ─────────────────────────────────────────────────────────────────────────────
// Storage Hero — Underwriting Engine
// Encodes Brandon's team's self-storage financial model (Ripco).
// Deterministic, accurate, instant. The AI Analyst calls this — it never does
// the arithmetic itself.
//
// Model flow (matches the team's .xlsm):
//   Rental Income + Other Income          → Potential Gross Income (PGI)
//   PGI − (Vacancy% × Rental Income)       → Effective Gross Income (EGI)
//   EGI − Total Expenses                   → Net Operating Income (NOI)
//   NOI ÷ Purchase Price                   → Cap Rate
//   Valuation: Conservative / Target / Aggressive
//   Debt: LTV, rate, term, amortization → annual debt service (PMT)
//   NOI ÷ Debt Service                     → DSCR
//   (NOI − Debt Service) ÷ Equity          → Cash-on-Cash
// ─────────────────────────────────────────────────────────────────────────────

// Standard expense line items from the team's model (2023 P&L structure)
export const EXPENSE_CATEGORIES = [
  { key: 'realEstateTaxes',   label: 'Real Estate Taxes' },
  { key: 'insurance',         label: 'Insurance' },
  { key: 'creditCardFees',    label: 'Credit Card Fees' },
  { key: 'computerWebsite',   label: 'Computer & Website' },
  { key: 'thirdPartyCollection', label: '3rd Party Collection' },
  { key: 'otherSupplies',     label: 'Other Supplies' },
  { key: 'marketing',         label: 'Marketing & Advertising' },
  { key: 'repairsMaintenance', label: 'Repairs & Maintenance' },
  { key: 'telephone',         label: 'Telephone' },
  { key: 'utilities',         label: 'Utilities' },
  { key: 'payroll',           label: 'Payroll & Benefits' },
  { key: 'reserves',          label: 'Reserves' },
];

// ── Amortizing loan payment (annual) — Excel PMT equivalent ──
// rate = annual interest rate (e.g. 0.075), amortYears = amortization period (e.g. 30)
export function annualDebtService(loanAmount, annualRate, amortYears) {
  if (!loanAmount || loanAmount <= 0) return 0;
  if (!annualRate || annualRate <= 0) return loanAmount / (amortYears || 30); // interest-free edge case
  const r = annualRate / 12;
  const n = amortYears * 12;
  const monthly = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
}

// ── Core underwrite ──
// Input shape (all optional except where the calc needs them; sensible defaults applied):
// {
//   // Income
//   rentalIncomeAnnual,  // annual in-place rental income ($)
//   otherIncomeAnnual,   // annual other income ($) — default 0
//   vacancyRate,         // decimal, e.g. 0.10 — default 0.10
//   // Property
//   units, sqft,
//   // Expenses — either an object keyed by EXPENSE_CATEGORIES, or a single totalExpenses number
//   expenses,            // { realEstateTaxes: 2085, insurance: 3006, ... }
//   totalExpensesAnnual, // alternative: lump-sum annual expenses
//   // Valuation scenarios (purchase prices)
//   purchasePrice,       // target purchase price ($) — drives cap rate
//   conservativePrice, targetPrice, aggressivePrice, // optional explicit 3-scenario
//   // Debt
//   ltv,                 // decimal, default 0.60
//   interestRate,        // decimal, default 0.075
//   amortYears,          // default 30
//   termYears,           // default 5 (informational)
// }
export function underwrite(input = {}) {
  const otherIncome = num(input.otherIncomeAnnual);
  const rentalIncome = num(input.rentalIncomeAnnual);
  const vacancyRate = input.vacancyRate != null ? num(input.vacancyRate) : 0.10;

  // Income waterfall
  const pgi = rentalIncome + otherIncome;
  const vacancyLoss = rentalIncome * vacancyRate;
  const egi = pgi - vacancyLoss;

  // Expenses
  let totalExpenses = 0;
  let expenseBreakdown = {};
  if (input.expenses && typeof input.expenses === 'object') {
    for (const cat of EXPENSE_CATEGORIES) {
      const v = num(input.expenses[cat.key]);
      expenseBreakdown[cat.key] = v;
      totalExpenses += v;
    }
  } else {
    totalExpenses = num(input.totalExpensesAnnual);
  }

  const expenseRatio = egi > 0 ? totalExpenses / egi : 0;
  const noi = egi - totalExpenses;

  // Valuation scenarios
  const target = num(input.targetPrice) || num(input.purchasePrice);
  const conservative = num(input.conservativePrice) || (target ? round(target * 0.944) : 0); // ~5.6% below target
  const aggressive = num(input.aggressivePrice) || (target ? round(target * 1.056) : 0);     // ~5.6% above target

  const scenarios = ['conservative', 'target', 'aggressive'].map((name, i) => {
    const price = [conservative, target, aggressive][i];
    return {
      name,
      price,
      capRate: price > 0 ? noi / price : 0,
      pricePerUnit: input.units ? price / num(input.units) : null,
      pricePerSqft: input.sqft ? price / num(input.sqft) : null,
    };
  });

  // Debt (based on target price)
  const ltv = input.ltv != null ? num(input.ltv) : 0.60;
  const interestRate = input.interestRate != null ? num(input.interestRate) : 0.075;
  const amortYears = num(input.amortYears) || 30;
  const termYears = num(input.termYears) || 5;
  const loanAmount = target * ltv;
  const equityRequired = target - loanAmount;
  const debtService = annualDebtService(loanAmount, interestRate, amortYears);
  const loanConstant = loanAmount > 0 ? debtService / loanAmount : 0;
  const cashFlow = noi - debtService;
  const cashOnCash = equityRequired > 0 ? cashFlow / equityRequired : 0;
  const dscr = debtService > 0 ? noi / debtService : 0;

  return {
    income: {
      rentalIncome, otherIncome, pgi,
      vacancyRate, vacancyLoss, egi,
    },
    expenses: {
      total: totalExpenses,
      ratio: expenseRatio,
      breakdown: expenseBreakdown,
      perUnit: input.units ? totalExpenses / num(input.units) : null,
    },
    noi,
    scenarios,
    debt: {
      ltv, interestRate, amortYears, termYears,
      loanAmount, equityRequired,
      annualDebtService: debtService,
      monthlyDebtService: debtService / 12,
      loanConstant,
      cashFlow,
      cashOnCash,
      dscr,
    },
  };
}

// ── 5-year projection ──
// EGI grows revenueGrowth/yr (default 3%), expenses grow expenseGrowth/yr (default 2%),
// vacancy declines across the ramp (default 35% → 15%).
export function projectFiveYear(input = {}, opts = {}) {
  const revenueGrowth = opts.revenueGrowth != null ? opts.revenueGrowth : 0.03;
  const expenseGrowth = opts.expenseGrowth != null ? opts.expenseGrowth : 0.02;
  const vacancyRamp = opts.vacancyRamp || [0.35, 0.30, 0.25, 0.20, 0.15];

  const base = underwrite(input);
  const baseRental = base.income.rentalIncome;
  const otherIncome = base.income.otherIncome;
  const baseExpenses = base.expenses.total;
  const targetPrice = num(input.targetPrice) || num(input.purchasePrice);

  const years = [];
  for (let y = 0; y < 5; y++) {
    const rental = baseRental * Math.pow(1 + revenueGrowth, y);
    const vac = vacancyRamp[y] ?? vacancyRamp[vacancyRamp.length - 1];
    const egi = (rental + otherIncome) - rental * vac;
    const expenses = baseExpenses * Math.pow(1 + expenseGrowth, y);
    const noi = egi - expenses;
    years.push({
      year: y + 1,
      egi, expenses, noi,
      capRate: targetPrice > 0 ? noi / targetPrice : 0,
    });
  }
  return years;
}

// ── helpers ──
function num(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[$,%\s]/g, '')) : v;
  return Number.isFinite(n) ? n : 0;
}
function round(n) { return Math.round(n); }

// ── formatting helpers for display ──
export const fmt = {
  money: (n) => n == null ? '—' : `$${Math.round(n).toLocaleString()}`,
  money2: (n) => n == null ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
  pct: (n) => n == null ? '—' : `${(n * 100).toFixed(2)}%`,
  pct1: (n) => n == null ? '—' : `${(n * 100).toFixed(1)}%`,
  x: (n) => n == null ? '—' : `${n.toFixed(2)}x`,
};
