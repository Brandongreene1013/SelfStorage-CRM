import assert from 'node:assert/strict';
import { deleteContactsFromCrm } from '../src/lib/contactDeletion.js';

function mockSupabase({ rpcResult, linkedClients = [] }) {
  const calls = [];
  class Query {
    constructor(table) { this.call = { table, operation: null, filters: [] }; }
    select(columns) { this.call.operation = 'select'; this.call.columns = columns; return this; }
    delete() { this.call.operation = 'delete'; return this; }
    in(column, values) { this.call.filters.push(['in', column, values]); return this; }
    eq(column, value) { this.call.filters.push(['eq', column, value]); return this; }
    then(resolve) {
      calls.push(this.call);
      if (this.call.table === 'clients' && this.call.operation === 'select') {
        return resolve({ data: linkedClients.map(id => ({ id })), error: null });
      }
      return resolve({ data: null, error: null });
    }
  }
  return {
    calls,
    client: {
      rpc: async (name, args) => {
        calls.push({ operation: 'rpc', name, args });
        return rpcResult;
      },
      from: table => new Query(table),
    },
  };
}

{
  const mock = mockSupabase({ rpcResult: { data: { deleted_contacts: 1, deleted_clients: 2 }, error: null } });
  const result = await deleteContactsFromCrm(mock.client, ['contact-1']);
  assert.deepEqual(result, { ok: true, deletedCount: 1, deletedClientCount: 2, atomic: true });
  assert.equal(mock.calls.filter(call => call.table).length, 0, 'installed RPC should own the whole transaction');
}

{
  const mock = mockSupabase({
    rpcResult: { data: null, error: { code: 'PGRST202', message: 'function not in schema cache' } },
    linkedClients: ['client-1'],
  });
  const result = await deleteContactsFromCrm(mock.client, ['contact-1']);
  assert.deepEqual(result, { ok: true, deletedCount: 1, deletedClientCount: 1, atomic: false });

  const deletes = mock.calls.filter(call => call.operation === 'delete');
  assert.deepEqual(deletes.map(call => call.table), [
    'tasks', 'tasks', 'mailer_list_members', 'mailer_list_members', 'clients', 'contacts',
  ]);
  assert.deepEqual(deletes.at(-1).filters, [['in', 'id', ['contact-1']]], 'canonical contact is deleted last');
  assert.deepEqual(deletes[0].filters, [
    ['in', 'related_id', ['contact-1']], ['eq', 'related_type', 'contact'],
  ]);
  assert.deepEqual(deletes[1].filters, [
    ['in', 'related_id', ['client-1']], ['eq', 'related_type', 'client'],
  ]);
}

console.log('contact deletion tests passed');
