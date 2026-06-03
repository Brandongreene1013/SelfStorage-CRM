import * as XLSX from 'xlsx';

// Expense line-item order as it appears in the Financial Model sheet (rows 18–29)
const EXPENSE_ROWS = [
  'realEstateTaxes', 'insurance', 'creditCardFees', 'computerWebsite',
  'thirdPartyCollection', 'otherSupplies', 'marketing', 'repairsMaintenance',
  'telephone', 'utilities', 'payroll', 'reserves',
];

function setNum(ws, addr, v) {
  ws[addr] = { t: 'n', v: Number.isFinite(+v) ? +v : 0 };
}

// Drop cached formula values so Excel recomputes everything on open
function clearCachedFormulas(ws) {
  if (!ws || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.f) delete cell.v;
    }
  }
}

// model = the underwrite() result: { property, income, expenses.breakdown, scenarios[], debt }
export async function downloadFilledModel(model, filenameBase = 'Underwriting') {
  const res = await fetch('/model-template.xlsm');
  if (!res.ok) throw new Error('Could not load the model template');
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { bookVBA: true, cellStyles: true });

  const fm = wb.Sheets['Financial Model'];
  const rr = wb.Sheets['Rent Roll'];

  // ── Rent Roll: collapse to a single summary row (row 7), clear rows 8–12 ──
  const units = model.property?.units > 0 ? model.property.units : 1;
  const sqft = model.property?.sqft || 0;
  const rentalAnnual = model.income?.rentalIncome || 0;
  const monthlyPerUnit = rentalAnnual / 12 / units;
  const sfPerUnit = sqft / units;

  if (rr) {
    rr['A7'] = { t: 's', v: 'All Units' };
    setNum(rr, 'C7', units);
    setNum(rr, 'D7', sfPerUnit);
    setNum(rr, 'F7', monthlyPerUnit);
    setNum(rr, 'H7', monthlyPerUnit); // market = in-place unless specified
    for (let row = 8; row <= 12; row++) {
      setNum(rr, `C${row}`, 0); setNum(rr, `D${row}`, 0);
      setNum(rr, `F${row}`, 0); setNum(rr, `H${row}`, 0);
    }
  }

  // ── Financial Model inputs ──
  if (fm) {
    const otherIncome = model.income?.otherIncome || 0;
    setNum(fm, 'F11', otherIncome);
    setNum(fm, 'G11', otherIncome);
    setNum(fm, 'B13', model.income?.vacancyRate || 0);

    const bd = model.expenses?.breakdown || {};
    EXPENSE_ROWS.forEach((key, i) => {
      const row = 18 + i;
      const val = bd[key] || 0;
      setNum(fm, `F${row}`, val);
      setNum(fm, `G${row}`, val);
    });

    const [cons, tgt, agg] = model.scenarios || [];
    setNum(fm, 'E35', cons?.price || 0);
    setNum(fm, 'F35', tgt?.price || 0);
    setNum(fm, 'G35', agg?.price || 0);

    const debt = model.debt || {};
    setNum(fm, 'F44', debt.ltv ?? 0.6);
    setNum(fm, 'G45', debt.interestRate ?? 0.075);
    setNum(fm, 'G46', debt.termYears ?? 5);
    setNum(fm, 'G47', debt.amortYears ?? 30);
  }

  // Force a full recalc when opened in Excel
  ['Rent Roll', 'Financial Model', '5-Year Model', 'Amortization'].forEach(n => clearCachedFormulas(wb.Sheets[n]));
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.CalcPr = { ...(wb.Workbook.CalcPr || {}), fullCalcOnLoad: true };

  const out = XLSX.write(wb, { bookType: 'xlsm', bookVBA: true, type: 'array' });
  const blob = new Blob([out], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });

  const safe = (filenameBase || 'Underwriting').replace(/[^\w.\- ]+/g, '').slice(0, 60).trim() || 'Underwriting';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.xlsm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
