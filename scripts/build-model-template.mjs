import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import fs from 'fs';

const SRC = "C:/Users/brand/OneDrive/Documents/Self-Storage Underwriting Spreadsheet w Amortization Calculator (2).xlsm";
const OUT = "public/model-template.xlsm";

const files = unzipSync(new Uint8Array(fs.readFileSync(SRC)));

// ── Fix 5-Year Model (sheet3.xml): stale hard-coded Year-1 cells -> live formulas ──
let s3 = strFromU8(files['xl/worksheets/sheet3.xml']);
const setFormula = (xml, ref, formula) => {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:\s+t="[^"]*")?>(?:<f>[^<]*</f>)?(?:<v>[^<]*</v>)?</c>`);
  if (!re.test(xml)) throw new Error('cell not found: ' + ref);
  return xml.replace(re, `<c r="${ref}"$1><f>${formula}</f></c>`);
};
// Year-1 expenses = market column (E) grown 2% (matches the rows that already work)
for (const r of [16,17,18,21,22,23,25,26,27]) s3 = setFormula(s3, `F${r}`, `E${r}*2%+E${r}`);
// Other income: Year1 from deal (E9 = 'Financial Model'!G11), then held flat across the ramp
s3 = setFormula(s3, 'F9', 'E9');
s3 = setFormula(s3, 'G9', 'F9');
s3 = setFormula(s3, 'H9', 'G9');
s3 = setFormula(s3, 'I9', 'H9');
s3 = setFormula(s3, 'J9', 'I9');
files['xl/worksheets/sheet3.xml'] = strToU8(s3);

// ── Force full recalc on open ──
let wbxml = strFromU8(files['xl/workbook.xml']);
if (/<calcPr[^>]*\/>/.test(wbxml)) {
  wbxml = wbxml.replace(/<calcPr([^>]*?)\/>/, (m, a) =>
    `<calcPr${/fullCalcOnLoad/.test(a) ? a.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"') : a + ' fullCalcOnLoad="1"'}/>`);
} else {
  wbxml = wbxml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
}
files['xl/workbook.xml'] = strToU8(wbxml);

// ── Drop calcChain.xml so Excel rebuilds it (avoids stale-chain repair prompts) ──
delete files['xl/calcChain.xml'];
let ct = strFromU8(files['[Content_Types].xml']);
ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
files['[Content_Types].xml'] = strToU8(ct);
let rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
rels = rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, '');
files['xl/_rels/workbook.xml.rels'] = strToU8(rels);

const zipped = zipSync(files, { level: 6 });
fs.writeFileSync(OUT, zipped);
console.log('Wrote', OUT, zipped.length, 'bytes');
