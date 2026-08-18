-- Transactional whole-CRM contact deletion.
--
-- "Remove from this list" is intentionally NOT implemented here; that action
-- only removes contact_list_memberships (and, for a legacy home-list record,
-- re-homes the canonical contact in Master Database). This function is solely
-- for the explicit "Delete from CRM" action.

create or replace function public.delete_contacts_from_crm(p_contact_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contact_ids uuid[] := coalesce(p_contact_ids, array[]::uuid[]);
  v_client_ids uuid[];
  v_deleted_contacts integer := 0;
  v_deleted_clients integer := 0;
begin
  select coalesce(array_agg(id), array[]::uuid[])
    into v_client_ids
  from public.clients
  where contact_id = any(v_contact_ids);

  delete from public.tasks
  where (related_type = 'contact' and related_id = any(v_contact_ids))
     or (related_type = 'client' and related_id = any(v_client_ids));

  delete from public.mailer_list_members
  where (member_type = 'contact' and member_id = any(v_contact_ids))
     or (member_type = 'client' and member_id = any(v_client_ids));

  delete from public.clients where id = any(v_client_ids);
  get diagnostics v_deleted_clients = row_count;

  -- FK cascades remove Core Client profiles/continuum history, targeted-list
  -- memberships, and property relationships tied directly to the contacts.
  delete from public.contacts where id = any(v_contact_ids);
  get diagnostics v_deleted_contacts = row_count;

  return jsonb_build_object(
    'deleted_contacts', v_deleted_contacts,
    'deleted_clients', v_deleted_clients
  );
end;
$$;

grant execute on function public.delete_contacts_from_crm(uuid[]) to anon, authenticated;

comment on function public.delete_contacts_from_crm(uuid[]) is
  'Permanently removes contacts plus their directly linked tasks, mailer memberships, Core Client profiles, and Pipeline opportunities.';

