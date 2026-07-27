function cleanFilename(value) {
  const base = String(value || 'CRM Export')
    .replace(/\.xlsx$/i, '')
    .split('')
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim();
  return `${base || 'CRM Export'}.xlsx`;
}

function columnWidth(column, rows) {
  const longest = rows.reduce((max, row) => {
    const length = String(row[column.key] ?? '').length;
    return Math.max(max, length);
  }, column.label.length);
  return { wch: Math.min(Math.max(longest + 2, 12), 42) };
}

export async function downloadCrmSpreadsheet(exportData) {
  if (!exportData?.columns?.length) {
    throw new Error('This export does not contain any columns.');
  }

  const XLSX = await import('xlsx');
  const rows = Array.isArray(exportData.rows) ? exportData.rows : [];
  const headers = exportData.columns.map(column => column.label);
  const values = rows.map(row => exportData.columns.map(column => row[column.key] ?? ''));
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...values]);

  worksheet['!cols'] = exportData.columns.map(column => columnWidth(column, rows));
  if (worksheet['!ref']) worksheet['!autofilter'] = { ref: worksheet['!ref'] };

  const workbook = XLSX.utils.book_new();
  const sheetName = [':', '\\', '/', '?', '*', '[', ']']
    .reduce(
      (value, invalidCharacter) => value.replaceAll(invalidCharacter, ''),
      String(exportData.sheetName || 'CRM Data'),
    )
    .slice(0, 31) || 'CRM Data';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, cleanFilename(exportData.filename));
}
