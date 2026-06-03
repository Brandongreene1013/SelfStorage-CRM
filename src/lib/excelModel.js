import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

// ─────────────────────────────────────────────────────────────────────────────
// Fills the team's SIGNATURE underwriting workbook (public/model-template.xlsm)
// with a deal's figures.
//
// We do NOT round-trip the file through SheetJS — that silently strips the
// workbook's drawings (logo), embedded images, and most cell styling, which is
// why earlier exports "looked nothing like" the real model. Instead we open the
// .xlsm as a zip and surgically replace ONLY the input-cell values in the
// worksheet XML, leaving drawings, media, styles, formulas, and the VBA project
// byte-for-byte intact.
//
// Sheet → part map (verified against the real file):
//   sheet1.xml = Rent Roll
//   sheet2.xml = Financial Model
//   sheet3.xml = 5-Year Model      (formulas only — driven by the two above)
//   sheet4.xml = Amortization      (left untouched: financing is set by hand)
//
// Input cells we write:
//   Rent Roll:        C7 units · D7 SF/unit · F7 base $/unit/mo · H7 market $/unit/mo
//   Financial Model:  F11/G11 other income · B13 vacancy · F/G 18–29 expenses ·
//                     E35/F35/G35 conservative/target/aggressive price
// Everything else (NOI, EGI, cap rate, 5-yr ramp, DSCR, amortization) is a
// formula in the workbook and recalculates on open (fullCalcOnLoad is baked in).
// ─────────────────────────────────────────────────────────────────────────────

const SHEET = {
  rentRoll: 'xl/worksheets/sheet1.xml',
  financialModel: 'xl/worksheets/sheet2.xml',
};

// Expense line-item order as it appears in the Financial Model (rows 18–29)
const EXPENSE_ROWS = [
  'realEstateTaxes', 'insurance', 'creditCardFees', 'computerWebsite',
  'thirdPartyCollection', 'otherSupplies', 'marketing', 'repairsMaintenance',
  'telephone', 'utilities', 'payroll', 'reserves',
];

// Replace one existing cell's value, preserving its style (s=") and dropping any
// stale type/formula. All target cells already exist in the template.
function setCell(xml, ref, value) {
  const v = Number.isFinite(+value) ? +value : 0;
  const re = new RegExp(`<c r="${ref}"((?:\\s+[a-zA-Z]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)`);
  if (!re.test(xml)) throw new Error(`Template cell ${ref} not found — model file may be the wrong version`);
  return xml.replace(re, (_m, attrs) => {
    const keep = attrs.replace(/\s+t="[^"]*"/g, ''); // strip type → numeric
    return `<c r="${ref}"${keep}><v>${v}</v></c>`;
  });
}

export async function downloadFilledModel(model, filenameBase = 'Underwriting') {
  const res = await fetch('/model-template.xlsm');
  if (!res.ok) throw new Error('Could not load the model template');
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));

  // ── Rent Roll (single summary row 7 → totals/annuals cascade via formulas) ──
  const units = model.property?.units > 0 ? model.property.units : 1;
  const sqft = model.property?.sqft || 0;
  const rentalAnnual = model.income?.rentalIncome || 0;
  const monthlyPerUnit = rentalAnnual / 12 / units;
  const sfPerUnit = sqft / units;

  let rr = strFromU8(files[SHEET.rentRoll]);
  rr = setCell(rr, 'C7', units);            // Number of units
  rr = setCell(rr, 'D7', sfPerUnit);        // Gross SF per unit
  rr = setCell(rr, 'F7', monthlyPerUnit);   // Base rent $/unit/mo
  rr = setCell(rr, 'H7', monthlyPerUnit);   // Market rent $/unit/mo (= in-place unless specified)
  files[SHEET.rentRoll] = strToU8(rr);

  // ── Financial Model inputs ──
  let fm = strFromU8(files[SHEET.financialModel]);
  const otherIncome = model.income?.otherIncome || 0;
  fm = setCell(fm, 'F11', otherIncome);
  fm = setCell(fm, 'G11', otherIncome);
  fm = setCell(fm, 'B13', model.income?.vacancyRate || 0);

  const bd = model.expenses?.breakdown || {};
  EXPENSE_ROWS.forEach((key, i) => {
    const row = 18 + i;
    const val = bd[key] || 0;
    fm = setCell(fm, `F${row}`, val);
    fm = setCell(fm, `G${row}`, val);
  });

  const [cons, tgt, agg] = model.scenarios || [];
  fm = setCell(fm, 'E35', cons?.price || 0);
  fm = setCell(fm, 'F35', tgt?.price || 0);
  fm = setCell(fm, 'G35', agg?.price || 0);
  files[SHEET.financialModel] = strToU8(fm);

  // Amortization (sheet4) is intentionally left as-is so the team's debt
  // assumptions and the VBA-driven options remain editable in Excel.

  const out = zipSync(files, { level: 6 });
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
