import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { selectAllRows } from '../lib/selectAllRows';
import { isMissingColumnError, isMissingTableError } from '../lib/supabaseErrors';

// Mailer Lists: named lists of contacts/clients for physical mailings.
// Members store the referenced person plus the exact selected mailing address,
// so one person can be mailed at multiple affiliated addresses.
// Backed by sql/mailer_lists_migration.sql;
// until that runs, `tablesMissing` is true and the UI shows a run-the-migration
// notice instead of silently failing.

function isMissingMailerSchemaError(error) {
  return isMissingColumnError(error, 'mailing_address')
    || isMissingColumnError(error, 'address_label');
}

function isMissingSentTrackingError(error) {
  return isMissingColumnError(error, 'sent_at');
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
    mailingAddress: row.mailing_address ?? '',
    addressLabel: row.address_label ?? '',
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function useMailerLists() {
  const [mailerLists, setMailerLists] = useState([]);
  const [members, setMembers] = useState([]);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [sentTrackingMissing, setSentTrackingMissing] = useState(false);

  const loadMailerLists = useCallback(async () => {
    const [listsRes, membersRes, sentTrackingRes] = await Promise.all([
      selectAllRows(() => supabase.from('mailer_lists').select('*').order('created_at', { ascending: true }).order('id', { ascending: true })),
      selectAllRows(() => supabase.from('mailer_list_members').select('*').order('created_at', { ascending: true }).order('id', { ascending: true })),
      supabase.from('mailer_list_members').select('sent_at').limit(1),
    ]);
    if (isMissingTableError(listsRes.error) || isMissingTableError(membersRes.error)) {
      setTablesMissing(true);
      return;
    }
    setTablesMissing(false);
    if (!listsRes.error && listsRes.data) setMailerLists(listsRes.data.map(dbToList));
    if (!membersRes.error && membersRes.data) setMembers(membersRes.data.map(dbToMember));
    setSentTrackingMissing(isMissingSentTrackingError(sentTrackingRes.error));
  }, []);

  useEffect(() => {
    loadMailerLists();
  }, [loadMailerLists]);

  const createList = useCallback(async (name) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return null;
    const { data: row, error } = await supabase
      .from('mailer_lists').insert([{ name: trimmed }]).select().single();
    if (isMissingTableError(error) || isMissingMailerSchemaError(error)) { setTablesMissing(true); return null; }
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

  const addMember = useCallback(async (listId, memberType, memberId, options = {}) => {
    const mailingAddress = (options.mailingAddress ?? '').trim();
    const addressLabel = (options.addressLabel ?? '').trim();
    const { data: row, error } = await supabase
      .from('mailer_list_members')
      .insert([{
        list_id: listId,
        member_type: memberType,
        member_id: memberId,
        mailing_address: mailingAddress,
        address_label: addressLabel,
      }])
      .select().single();
    if (isMissingTableError(error) || isMissingMailerSchemaError(error)) { setTablesMissing(true); return null; }
    if (error) {
      if (error.code === '23505') return 'exists';
      return null;
    }
    const member = dbToMember(row);
    setMembers(prev => [...prev, member]);
    return member;
  }, []);

  const removeMember = useCallback(async (listId, memberType, memberId, options = {}) => {
    let query = supabase
      .from('mailer_list_members').delete()
      .eq('list_id', listId).eq('member_type', memberType).eq('member_id', memberId);
    if (options.memberRowId) query = query.eq('id', options.memberRowId);
    else if (options.mailingAddress !== undefined) query = query.eq('mailing_address', (options.mailingAddress ?? '').trim());
    const { error } = await query;
    if (!error) {
      const targetAddress = options.mailingAddress === undefined ? undefined : (options.mailingAddress ?? '').trim();
      setMembers(prev => prev.filter(m => !(
        m.listId === listId &&
        m.memberType === memberType &&
        m.memberId === memberId &&
        (!options.memberRowId || m.id === options.memberRowId) &&
        (targetAddress === undefined || (m.mailingAddress ?? '') === targetAddress)
      )));
    }
  }, []);

  const setMemberSent = useCallback(async (memberRowId, sent) => {
    const sentAt = sent ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('mailer_list_members')
      .update({ sent_at: sentAt })
      .eq('id', memberRowId);
    if (isMissingSentTrackingError(error)) {
      setSentTrackingMissing(true);
      return false;
    }
    if (error) return false;
    setMembers(prev => prev.map(member => (
      member.id === memberRowId ? { ...member, sentAt } : member
    )));
    return true;
  }, []);

  // listIds a given contact/client/address is on - powers the picker's checkmarks
  const membershipFor = useCallback((memberType, memberId, mailingAddress) => {
    const address = mailingAddress === undefined ? undefined : (mailingAddress ?? '').trim();
    return new Set(members
      .filter(m => m.memberType === memberType && m.memberId === memberId
        && (address === undefined || (m.mailingAddress ?? '') === address))
      .map(m => m.listId));
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
    sentTrackingMissing,
    reload: loadMailerLists,
    createList,
    renameList,
    deleteList,
    addMember,
    removeMember,
    setMemberSent,
    membershipFor,
  };
}
