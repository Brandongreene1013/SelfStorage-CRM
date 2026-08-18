const BATCH_SIZE = 200;

function uniqueIds(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function missingRpc(error) {
  const message = String(error?.message ?? '');
  return error?.code === 'PGRST202'
    || message.includes('delete_contacts_from_crm')
    || message.includes('schema cache');
}

function optionalTableMissing(error) {
  const message = String(error?.message ?? '');
  return error?.code === 'PGRST205'
    || error?.code === '42P01'
    || message.includes('Could not find the table');
}

async function deleteWhereIn(supabase, table, column, ids, { optional = false } = {}) {
  if (ids.length === 0) return { ok: true };
  const { error } = await supabase.from(table).delete().in(column, ids);
  if (error && optional && optionalTableMissing(error)) return { ok: true, skipped: true };
  return error ? { error: error.message } : { ok: true };
}

async function fallbackDeleteBatch(supabase, contactIds) {
  const linkedClients = await supabase
    .from('clients')
    .select('id')
    .in('contact_id', contactIds);
  if (linkedClients.error) return { error: linkedClients.error.message };
  const clientIds = uniqueIds((linkedClients.data ?? []).map(row => row.id));

  const cleanup = [
    ['tasks', 'related_id', contactIds, false, query => query.eq('related_type', 'contact')],
    ['tasks', 'related_id', clientIds, false, query => query.eq('related_type', 'client')],
    ['mailer_list_members', 'member_id', contactIds, true, query => query.eq('member_type', 'contact')],
    ['mailer_list_members', 'member_id', clientIds, true, query => query.eq('member_type', 'client')],
  ];

  for (const [table, column, ids, optional, scope] of cleanup) {
    if (ids.length === 0) continue;
    let query = supabase.from(table).delete().in(column, ids);
    query = scope(query);
    const { error } = await query;
    if (error && !(optional && optionalTableMissing(error))) return { error: error.message };
  }

  const clientDelete = await deleteWhereIn(supabase, 'clients', 'id', clientIds);
  if (clientDelete.error) return clientDelete;

  // Core Client profiles, continuum history, targeted-list memberships, and
  // property relationships have contact foreign keys with ON DELETE CASCADE.
  const contactDelete = await deleteWhereIn(supabase, 'contacts', 'id', contactIds);
  if (contactDelete.error) return contactDelete;

  return { ok: true, deletedCount: contactIds.length, deletedClientCount: clientIds.length, atomic: false };
}

// Permanently erase people from every person-scoped CRM surface. The RPC is
// transactional when its migration is installed. The ordered fallback keeps
// current production working immediately and removes non-FK references before
// deleting the canonical contact rows.
export async function deleteContactsFromCrm(supabase, values) {
  const ids = uniqueIds(values);
  if (ids.length === 0) return { error: 'Select at least one person.' };

  let deletedCount = 0;
  let deletedClientCount = 0;
  let atomic = true;
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const rpc = await supabase.rpc('delete_contacts_from_crm', { p_contact_ids: batch });
    let result;
    if (!rpc.error) {
      result = {
        ok: true,
        deletedCount: Number(rpc.data?.deleted_contacts ?? batch.length),
        deletedClientCount: Number(rpc.data?.deleted_clients ?? 0),
        atomic: true,
      };
    } else if (missingRpc(rpc.error)) {
      result = await fallbackDeleteBatch(supabase, batch);
    } else {
      result = { error: rpc.error.message };
    }

    if (result.error) return { ...result, deletedCount, deletedClientCount, atomic };
    deletedCount += result.deletedCount;
    deletedClientCount += result.deletedClientCount;
    atomic = atomic && result.atomic;
  }

  return { ok: true, deletedCount, deletedClientCount, atomic };
}

