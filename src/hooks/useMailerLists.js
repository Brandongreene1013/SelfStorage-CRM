import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Mailer Lists — named lists of contacts/clients for physical mailings.
// Members are stored as (member_type, member_id) references; the mailing
// address itself lives on the contact/client record, so edits there flow
// through to every list automatically. Backed by sql/mailer_lists_migration.sql;
// until that runs, `tablesMissing` is true and the UI shows a run-the-migration
// notice instead of silently failing.

function isMissingTableError(error) {
  if (!error) return false;
  const msg = error.message ?? '';
  return error.code === '42P01' || error.code === 'PGRST205'
    || /relation .*mailer_list.* does not exist|could not find the table/i.test(msg);
}

function dbToList(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at ?? null };
}

function dbToMember(row) {
  return {
    id: row.id,
    listId: row.list_id,
    memberType: row.member_type,
    memberId: row.member_id,
    createdAt: row.created_at ?? null,
  };
}

export function useMailerLists() {
  const [mailerLists, setMailerLists] = useState([]);
  const [members, setMembers] = useState([]);
  const [tablesMissing, setTablesMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const [listsRes, membersRes] = await Promise.all([
        supabase.from('mailer_lists').select('*').order('created_at', { ascending: true }),
        supabase.from('mailer_list_members').select('*').order('created_at', { ascending: true }),
      ]);
      if (isMissingTableError(listsRes.error) || isMissingTableError(membersRes.error)) {
        setTablesMissing(true);
        return;
      }
      if (!listsRes.error && listsRes.data) setMailerLists(listsRes.data.map(dbToList));
      if (!membersRes.error && membersRes.data) setMembers(membersRes.data.map(dbToMember));
    })();
  }, []);

  const createList = useCallback(async (name) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return null;
    const { data: row, error } = await supabase
      .from('mailer_lists').insert([{ name: trimmed }]).select().single();
    if (isMissingTableError(error)) { setTablesMissing(true); return null; }
    if (error || !row) return null;
    const list = dbToList(row);
    setMailerLists(prev => [...prev, list]);
    return list;
  }, []);

  const renameList = useCallback(async (listId, name) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return;
    const { error } = await supabase.from('mailer_lists').update({ name: trimmed }).eq('id', listId);
    if (!error) setMailerLists(prev => prev.map(l => l.id === listId ? { ...l, name: trimmed } : l));
  }, []);

  const deleteList = useCallback(async (listId) => {
    const { error } = await supabase.from('mailer_lists').delete().eq('id', listId);
    if (!error) {
      setMailerLists(prev => prev.filter(l => l.id !== listId));
      setMembers(prev => prev.filter(m => m.listId !== listId));
    }
  }, []);

  const addMember = useCallback(async (listId, memberType, memberId) => {
    const { data: row, error } = await supabase
      .from('mailer_list_members')
      .insert([{ list_id: listId, member_type: memberType, member_id: memberId }])
      .select().single();
    if (isMissingTableError(error)) { setTablesMissing(true); return null; }
    if (error) {
      // unique violation = already on the list; treat as success
      if (error.code === '23505') return 'exists';
      return null;
    }
    const member = dbToMember(row);
    setMembers(prev => [...prev, member]);
    return member;
  }, []);

  const removeMember = useCallback(async (listId, memberType, memberId) => {
    const { error } = await supabase
      .from('mailer_list_members').delete()
      .eq('list_id', listId).eq('member_type', memberType).eq('member_id', memberId);
    if (!error) {
      setMembers(prev => prev.filter(m =>
        !(m.listId === listId && m.memberType === memberType && m.memberId === memberId)));
    }
  }, []);

  // listIds a given contact/client is on — powers the picker's checkmarks
  const membershipFor = useCallback((memberType, memberId) => {
    return new Set(members.filter(m => m.memberType === memberType && m.memberId === memberId).map(m => m.listId));
  }, [members]);

  const memberCounts = useMemo(() => {
    const counts = {};
    members.forEach(m => { counts[m.listId] = (counts[m.listId] ?? 0) + 1; });
    return counts;
  }, [members]);

  return {
    mailerLists,
    members,
    memberCounts,
    tablesMissing,
    createList,
    renameList,
    deleteList,
    addMember,
    removeMember,
    membershipFor,
  };
}
