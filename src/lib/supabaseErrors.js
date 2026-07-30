export function supabaseErrorText(error) {
  return `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.trim();
}

export function isMissingColumnError(error, columnName = '') {
  if (!error) return false;
  const text = supabaseErrorText(error);
  const missingColumnSignal = error.code === '42703'
    || error.code === 'PGRST204'
    || /column .* does not exist|could not find .* column/i.test(text);
  if (!missingColumnSignal) return false;
  if (!columnName) return true;
  return text.toLowerCase().includes(String(columnName).toLowerCase());
}

export function isMissingTableError(error, tableName = '') {
  if (!error) return false;
  const text = supabaseErrorText(error);
  const missingTableSignal = error.code === '42P01'
    || error.code === 'PGRST205'
    || /relation .* does not exist|could not find the table/i.test(text);
  if (!missingTableSignal) return false;
  if (!tableName) return true;
  return text.toLowerCase().includes(String(tableName).toLowerCase());
}

export function isPermissionDeniedError(error) {
  if (!error) return false;
  return error.code === '42501'
    || error.status === 401
    || error.status === 403
    || /permission denied|not authorized|unauthorized/i.test(supabaseErrorText(error));
}

export function classifySchemaProbe(error) {
  if (!error) return 'ready';
  if (isPermissionDeniedError(error)) return 'server_only';
  if (isMissingTableError(error) || isMissingColumnError(error)) return 'migration_needed';
  return 'error';
}
