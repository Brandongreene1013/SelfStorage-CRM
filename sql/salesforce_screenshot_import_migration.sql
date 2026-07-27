-- Salesforce Screenshot Import v1
-- Run in the Supabase SQL Editor before enabling the production feature flag.
-- Safe to run repeatedly. Existing CRM records are not modified.

create extension if not exists pgcrypto;

-- Extend the canonical facility table rather than creating a second facility system.
alter table public.properties
  add column if not exists record_type text not null default '',
  add column if not exists property_class text not null default '',
  add column if not exists zip_code text not null default '',
  add column if not exists county text not null default '',
  add column if not exists website text not null default '',
  add column if not exists property_group text not null default '',
  add column if not exists year_built integer,
  add column if not exists facility_phone text not null default '',
  add column if not exists units integer,
  add column if not exists rentable_sqft numeric,
  add column if not exists acreage numeric,
  add column if not exists occupancy numeric,
  add column if not exists expansion_potential text not null default '',
  add column if not exists last_sale_date date,
  add column if not exists last_sale_price numeric,
  add column if not exists last_sale_price_psf numeric,
  add column if not exists last_cap_rate numeric,
  add column if not exists source_record_id text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_properties_salesforce_record
  on public.properties (source_record_id)
  where source = 'Salesforce Screenshot' and source_record_id is not null;
create index if not exists idx_properties_normalized_address
  on public.properties (lower(regexp_replace(address, '[^a-zA-Z0-9]+', ' ', 'g')));

-- ownership_groups remains the canonical company/owner entity.
alter table public.ownership_groups
  add column if not exists company_type text not null default '',
  add column if not exists website text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists mailing_address text not null default '',
  add column if not exists source_record_id text,
  add column if not exists source text not null default '',
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_ownership_groups_salesforce_record
  on public.ownership_groups (source_record_id)
  where source = 'Salesforce Screenshot' and source_record_id is not null;

-- Contact identity/detail fields preserve Salesforce relationships without
-- changing the existing owner_name display contract used by Database/Call Mode.
alter table public.contacts
  add column if not exists first_name text not null default '',
  add column if not exists middle_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists job_title text not null default '',
  add column if not exists contact_role text not null default '',
  add column if not exists company_name text not null default '',
  add column if not exists source_record_id text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_contacts_salesforce_record
  on public.contacts (source_record_id)
  where source = 'Salesforce Screenshot' and source_record_id is not null;

-- Many-to-many relationship extension. properties.ownership_group_id remains
-- the primary owner link used by the existing UI.
create table if not exists public.property_relationships (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  ownership_group_id uuid references public.ownership_groups(id) on delete cascade,
  relationship_type text not null,
  role text not null default '',
  source text not null default '',
  source_record_id text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_id is not null or ownership_group_id is not null),
  check (relationship_type in (
    'facility_primary_owner_contact',
    'facility_secondary_owner_contact',
    'facility_owner_company',
    'facility_management_company',
    'contact_company',
    'company_parent_company',
    'other'
  ))
);

create unique index if not exists idx_property_relationship_unique_contact
  on public.property_relationships (property_id, contact_id, relationship_type)
  where contact_id is not null;
create unique index if not exists idx_property_relationship_unique_group
  on public.property_relationships (property_id, ownership_group_id, relationship_type)
  where ownership_group_id is not null;

alter table public.property_relationships enable row level security;
drop policy if exists "property_relationships_all" on public.property_relationships;
create policy "property_relationships_all" on public.property_relationships
  for all using (true) with check (true);

-- Private staging records. No anon/authenticated policies are intentionally
-- created; service-role access bypasses RLS.
create table if not exists public.salesforce_screenshot_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  capability_hash text not null,
  status text not null default 'collecting_screenshots',
  source_system text not null default 'salesforce',
  source_method text not null default 'clipboard_screenshot',
  screenshot_count integer not null default 0,
  image_hashes jsonb not null default '[]'::jsonb,
  storage_paths jsonb not null default '[]'::jsonb,
  model_provider text,
  model_name text,
  prompt_version text,
  schema_version text,
  raw_model_response jsonb,
  validated_draft jsonb,
  user_edited_draft jsonb,
  overall_confidence numeric,
  duplicate_results jsonb not null default '[]'::jsonb,
  import_result jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  analyzed_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  imported_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  error_code text,
  error_message text,
  check (status in (
    'collecting_screenshots', 'ready_for_analysis', 'analyzing',
    'review_required', 'approved', 'rejected', 'importing',
    'imported', 'failed', 'expired'
  )),
  check (screenshot_count between 0 and 6)
);

create table if not exists public.salesforce_screenshot_import_images (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.salesforce_screenshot_imports(id) on delete cascade,
  user_id uuid,
  sequence_number integer not null,
  storage_path text not null unique,
  image_hash text not null,
  mime_type text not null,
  width integer not null,
  height integer not null,
  file_size integer not null,
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (import_id, image_hash),
  check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  check (width between 320 and 12000),
  check (height between 240 and 12000),
  check (file_size between 1 and 4194304)
);

create table if not exists public.salesforce_screenshot_import_events (
  id bigint generated by default as identity primary key,
  import_id uuid not null references public.salesforce_screenshot_imports(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in (
    'session_created', 'screenshot_pasted', 'screenshot_removed',
    'screenshots_reordered', 'analysis_started', 'analysis_completed',
    'analysis_failed', 'draft_edited', 'duplicate_detected',
    'import_approved', 'import_rejected', 'import_completed',
    'import_failed', 'screenshots_deleted'
  ))
);

alter table public.salesforce_screenshot_imports enable row level security;
alter table public.salesforce_screenshot_import_images enable row level security;
alter table public.salesforce_screenshot_import_events enable row level security;

revoke all on public.salesforce_screenshot_imports from anon, authenticated;
revoke all on public.salesforce_screenshot_import_images from anon, authenticated;
revoke all on public.salesforce_screenshot_import_events from anon, authenticated;

create index if not exists idx_salesforce_import_status on public.salesforce_screenshot_imports (status, expires_at);
create index if not exists idx_salesforce_import_images_import on public.salesforce_screenshot_import_images (import_id, sequence_number);
create index if not exists idx_salesforce_import_events_import on public.salesforce_screenshot_import_events (import_id, created_at);

-- Private storage bucket. Signed upload/download URLs are minted server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salesforce-imports',
  'salesforce-imports',
  false,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No public storage policies: only service-role operations and signed URLs.
drop policy if exists "salesforce_imports_public_read" on storage.objects;
drop policy if exists "salesforce_imports_public_write" on storage.objects;

-- One atomic and idempotent canonical commit. The API calls this with the
-- already-validated edited draft and capability hash.
create or replace function public.commit_salesforce_screenshot_import(
  p_import_id uuid,
  p_capability_hash text,
  p_approved_draft jsonb,
  p_duplicate_decisions jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import public.salesforce_screenshot_imports%rowtype;
  v_facility jsonb := p_approved_draft->'facility';
  v_property_id uuid;
  v_primary_group_id uuid;
  v_group_id uuid;
  v_contact_id uuid;
  v_master_list_id uuid;
  v_company jsonb;
  v_contact jsonb;
  v_relationship jsonb;
  v_decision jsonb;
  v_created_contacts jsonb := '{}'::jsonb;
  v_created_groups jsonb := '{}'::jsonb;
  v_result jsonb;
  v_name text;
  v_address text;
begin
  select * into v_import
  from public.salesforce_screenshot_imports
  where id = p_import_id
  for update;

  if not found or v_import.capability_hash <> p_capability_hash then
    raise exception 'Import session not found';
  end if;

  if v_import.status = 'imported' then
    if v_import.idempotency_key = p_idempotency_key then
      return v_import.import_result;
    end if;
    raise exception 'Import session already completed';
  end if;

  if v_import.status not in ('review_required', 'approved') then
    raise exception 'Import session is not ready for approval';
  end if;

  v_name := nullif(trim(v_facility->'name'->>'value'), '');
  v_address := nullif(trim(v_facility->'streetAddress'->>'value'), '');
  if v_name is null then raise exception 'Facility name is required'; end if;

  select id into v_master_list_id
  from public.lists
  where lower(name) = 'master database'
  order by created_at
  limit 1;
  if v_master_list_id is null then raise exception 'Master Database list not found'; end if;

  update public.salesforce_screenshot_imports
  set status = 'importing',
      approved_at = coalesce(approved_at, now()),
      idempotency_key = p_idempotency_key,
      user_edited_draft = p_approved_draft,
      updated_at = now()
  where id = p_import_id;

  -- Companies map to canonical ownership_groups.
  for v_company in select value from jsonb_array_elements(coalesce(p_approved_draft->'companies', '[]'::jsonb))
  loop
    if coalesce((v_company->>'selected')::boolean, true) is false then continue; end if;
    v_decision := coalesce(p_duplicate_decisions->'companies'->(v_company->>'tempId'), '{}'::jsonb);
    if v_decision->>'action' = 'skip' then continue; end if;
    if v_decision->>'action' in ('use_existing', 'update_blank') then
      v_group_id := (v_decision->>'existingId')::uuid;
      if v_decision->>'action' = 'update_blank' then
        update public.ownership_groups set
          display_name = coalesce(nullif(display_name, ''), coalesce(v_company->'name'->>'value', '')),
          owner_entity = coalesce(nullif(owner_entity, ''), coalesce(v_company->'name'->>'value', '')),
          company_type = coalesce(nullif(company_type, ''), coalesce(v_company->'companyType'->>'value', '')),
          website = coalesce(nullif(website, ''), coalesce(v_company->'website'->>'value', '')),
          phone = coalesce(nullif(phone, ''), coalesce(v_company->'mainPhone'->>'value', '')),
          mailing_address = coalesce(nullif(mailing_address, ''), coalesce(v_company->'mailingAddress'->>'value', '')),
          source_record_id = coalesce(source_record_id, nullif(v_company->'sourceRecordId'->>'value', '')),
          notes = coalesce(nullif(notes, ''), coalesce(v_company->'notes'->>'value', '')),
          updated_at = now()
        where id = v_group_id;
      end if;
    else
      insert into public.ownership_groups (
        display_name, owner_entity, relationship_type, company_type,
        website, phone, mailing_address, source_record_id, source,
        source_metadata, notes, updated_at
      ) values (
        coalesce(nullif(v_company->'name'->>'value', ''), 'Unnamed company'),
        coalesce(v_company->'name'->>'value', ''),
        'storage_owner_seller',
        coalesce(v_company->'companyType'->>'value', ''),
        coalesce(v_company->'website'->>'value', ''),
        coalesce(v_company->'mainPhone'->>'value', ''),
        coalesce(v_company->'mailingAddress'->>'value', ''),
        nullif(v_company->'sourceRecordId'->>'value', ''),
        'Salesforce Screenshot',
        jsonb_build_object('importId', p_import_id),
        coalesce(v_company->'notes'->>'value', ''),
        now()
      ) returning id into v_group_id;
    end if;
    v_created_groups := v_created_groups || jsonb_build_object(v_company->>'tempId', v_group_id);
    if v_primary_group_id is null and coalesce(v_company->'companyType'->>'value', '') = 'property_owner' then
      v_primary_group_id := v_group_id;
    end if;
  end loop;

  v_decision := coalesce(p_duplicate_decisions->'facility', '{}'::jsonb);
  if v_decision->>'action' = 'skip' then
    raise exception 'A facility import cannot skip the facility';
  end if;
  if v_decision->>'action' in ('use_existing', 'update_blank') then
    v_property_id := (v_decision->>'existingId')::uuid;
    if v_decision->>'action' = 'update_blank' then
      update public.properties set
        facility_name = coalesce(nullif(facility_name, ''), v_name),
        address = coalesce(nullif(address, ''), coalesce(v_address, '')),
        city = coalesce(nullif(city, ''), coalesce(v_facility->'city'->>'value', '')),
        state = coalesce(nullif(state, ''), coalesce(v_facility->'state'->>'value', '')),
        zip_code = coalesce(nullif(zip_code, ''), coalesce(v_facility->'zipCode'->>'value', '')),
        ownership_group_id = coalesce(ownership_group_id, v_primary_group_id),
        updated_at = now()
      where id = v_property_id;
    end if;
  else
    insert into public.properties (
      ownership_group_id, facility_name, record_type, property_type,
      property_class, address, city, state, zip_code, county, market,
      website, property_group, year_built, facility_phone, units,
      rentable_sqft, acreage, occupancy, expansion_potential, notes,
      last_sale_date, last_sale_price, last_sale_price_psf, last_cap_rate,
      source_record_id, source, source_metadata, updated_at
    ) values (
      v_primary_group_id,
      v_name,
      coalesce(v_facility->'recordType'->>'value', ''),
      coalesce(nullif(v_facility->'propertyType'->>'value', ''), 'Self-Storage'),
      coalesce(v_facility->'propertyClass'->>'value', ''),
      coalesce(v_address, ''),
      coalesce(v_facility->'city'->>'value', ''),
      coalesce(v_facility->'state'->>'value', ''),
      coalesce(v_facility->'zipCode'->>'value', ''),
      coalesce(v_facility->'county'->>'value', ''),
      concat_ws(', ', nullif(v_facility->'city'->>'value', ''), nullif(v_facility->'state'->>'value', '')),
      coalesce(v_facility->'website'->>'value', ''),
      coalesce(v_facility->'propertyGroup'->>'value', ''),
      nullif(v_facility->'yearBuilt'->>'value', '')::integer,
      coalesce(v_facility->'facilityPhone'->>'value', ''),
      nullif(v_facility->'units'->>'value', '')::integer,
      nullif(v_facility->'rentableSqft'->>'value', '')::numeric,
      nullif(v_facility->'acreage'->>'value', '')::numeric,
      nullif(v_facility->'occupancy'->>'value', '')::numeric,
      coalesce(v_facility->'expansionPotential'->>'value', ''),
      coalesce(v_facility->'notes'->>'value', ''),
      nullif(p_approved_draft->'propertyHistory'->'lastSaleDate'->>'value', '')::date,
      nullif(p_approved_draft->'propertyHistory'->'lastSalePrice'->>'value', '')::numeric,
      nullif(p_approved_draft->'propertyHistory'->'lastSalePricePsf'->>'value', '')::numeric,
      nullif(p_approved_draft->'propertyHistory'->'lastCapRate'->>'value', '')::numeric,
      nullif(p_approved_draft->'source'->'sourceRecordId'->>'value', ''),
      'Salesforce Screenshot',
      jsonb_build_object(
        'importId', p_import_id,
        'method', v_import.source_method,
        'screenshotCount', v_import.screenshot_count,
        'promptVersion', v_import.prompt_version
      ),
      now()
    ) returning id into v_property_id;
  end if;

  -- Contacts become Master Database records and retain links to the facility.
  for v_contact in select value from jsonb_array_elements(coalesce(p_approved_draft->'contacts', '[]'::jsonb))
  loop
    if coalesce((v_contact->>'selected')::boolean, true) is false then continue; end if;
    v_decision := coalesce(p_duplicate_decisions->'contacts'->(v_contact->>'tempId'), '{}'::jsonb);
    if v_decision->>'action' = 'skip' then continue; end if;
    if v_decision->>'action' in ('use_existing', 'update_blank') then
      v_contact_id := (v_decision->>'existingId')::uuid;
      if v_decision->>'action' = 'update_blank' then
        update public.contacts set
          owner_name = coalesce(nullif(owner_name, ''), coalesce(v_contact->'displayName'->>'value', '')),
          first_name = coalesce(nullif(first_name, ''), coalesce(v_contact->'firstName'->>'value', '')),
          middle_name = coalesce(nullif(middle_name, ''), coalesce(v_contact->'middleName'->>'value', '')),
          last_name = coalesce(nullif(last_name, ''), coalesce(v_contact->'lastName'->>'value', '')),
          owner_entity = coalesce(nullif(owner_entity, ''), coalesce(v_contact->'company'->>'value', '')),
          company_name = coalesce(nullif(company_name, ''), coalesce(v_contact->'company'->>'value', '')),
          facility_name = coalesce(nullif(facility_name, ''), v_name),
          contact_role = coalesce(nullif(contact_role, ''), coalesce(v_contact->'role'->>'value', '')),
          job_title = coalesce(nullif(job_title, ''), coalesce(v_contact->'jobTitle'->>'value', '')),
          phone = coalesce(nullif(phone, ''), coalesce(v_contact->'primaryPhone'->>'value', '')),
          email = coalesce(nullif(email, ''), coalesce(v_contact->'email'->>'value', '')),
          address = coalesce(nullif(address, ''), coalesce(v_address, '')),
          mailing_address = coalesce(nullif(mailing_address, ''), coalesce(v_contact->'mailingAddress'->>'value', '')),
          source_record_id = coalesce(source_record_id, nullif(v_contact->'sourceRecordId'->>'value', '')),
          ownership_group_id = coalesce(ownership_group_id, v_primary_group_id),
          updated_at = now()
        where id = v_contact_id;
      end if;
    else
      v_group_id := null;
      if nullif(v_contact->>'companyTempId', '') is not null then
        v_group_id := nullif(v_created_groups->>(v_contact->>'companyTempId'), '')::uuid;
      end if;
      insert into public.contacts (
        list_id, owner_name, first_name, middle_name, last_name,
        owner_entity, company_name, facility_name, relationship_type,
        contact_role, job_title, phone, alternate_phones, email, address,
        mailing_address, state, notes, status, call_history, action_log,
        source, source_record_id, source_metadata, imported_at,
        ownership_group_id, owner_identified_at, updated_at
      ) values (
        v_master_list_id,
        coalesce(v_contact->'displayName'->>'value', ''),
        coalesce(v_contact->'firstName'->>'value', ''),
        coalesce(v_contact->'middleName'->>'value', ''),
        coalesce(v_contact->'lastName'->>'value', ''),
        coalesce(v_contact->'company'->>'value', ''),
        coalesce(v_contact->'company'->>'value', ''),
        v_name,
        'storage_owner_seller',
        coalesce(v_contact->'role'->>'value', ''),
        coalesce(v_contact->'jobTitle'->>'value', ''),
        coalesce(v_contact->'primaryPhone'->>'value', ''),
        case when nullif(v_contact->'secondaryPhone'->>'value', '') is null
          then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object('label', 'Secondary', 'phone', v_contact->'secondaryPhone'->>'value'))
        end,
        coalesce(v_contact->'email'->>'value', ''),
        coalesce(v_address, ''),
        coalesce(v_contact->'mailingAddress'->>'value', ''),
        coalesce(v_facility->'state'->>'value', ''),
        coalesce(v_contact->'notes'->>'value', ''),
        'fresh',
        '[]'::jsonb,
        '[]'::jsonb,
        'Salesforce Screenshot',
        nullif(v_contact->'sourceRecordId'->>'value', ''),
        jsonb_build_object('importId', p_import_id, 'propertyId', v_property_id),
        now(),
        v_group_id,
        case when nullif(v_contact->'displayName'->>'value', '') is null then null else now() end,
        now()
      ) returning id into v_contact_id;
    end if;
    v_created_contacts := v_created_contacts || jsonb_build_object(v_contact->>'tempId', v_contact_id);
  end loop;

  -- Ensure a facility with no visible owner still appears in Master Database.
  if v_created_contacts = '{}'::jsonb then
    insert into public.contacts (
      list_id, owner_name, facility_name, relationship_type, address, state,
      notes, status, call_history, action_log, source, source_metadata,
      imported_at, ownership_group_id, updated_at
    ) values (
      v_master_list_id, '', v_name, 'storage_owner_seller',
      coalesce(v_address, ''), coalesce(v_facility->'state'->>'value', ''),
      'Facility imported from Salesforce screenshot; owner not visible.',
      'fresh', '[]'::jsonb, '[]'::jsonb, 'Salesforce Screenshot',
      jsonb_build_object('importId', p_import_id, 'propertyId', v_property_id),
      now(), v_primary_group_id, now()
    ) returning id into v_contact_id;
    v_created_contacts := v_created_contacts || jsonb_build_object('facility_placeholder', v_contact_id);
  end if;

  for v_relationship in select value from jsonb_array_elements(coalesce(p_approved_draft->'relationships', '[]'::jsonb))
  loop
    v_group_id := null;
    v_contact_id := null;
    if nullif(v_relationship->>'companyTempId', '') is not null then
      v_group_id := nullif(v_created_groups->>(v_relationship->>'companyTempId'), '')::uuid;
    end if;
    if nullif(v_relationship->>'contactTempId', '') is not null then
      v_contact_id := nullif(v_created_contacts->>(v_relationship->>'contactTempId'), '')::uuid;
    end if;
    if v_group_id is not null or v_contact_id is not null then
      insert into public.property_relationships (
        property_id, contact_id, ownership_group_id, relationship_type,
        role, source, evidence, updated_at
      ) values (
        v_property_id, v_contact_id, v_group_id,
        coalesce(v_relationship->>'relationshipType', 'other'),
        coalesce(v_relationship->>'role', ''),
        'Salesforce Screenshot',
        jsonb_build_object(
          'importId', p_import_id,
          'confidence', v_relationship->'confidence',
          'evidenceText', v_relationship->'evidenceText',
          'screenshotId', v_relationship->'screenshotId'
        ),
        now()
      ) on conflict do nothing;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'importId', p_import_id,
    'propertyId', v_property_id,
    'facilityName', v_name,
    'contactIds', v_created_contacts,
    'ownershipGroupIds', v_created_groups
  );

  update public.salesforce_screenshot_imports
  set status = 'imported',
      import_result = v_result,
      imported_at = now(),
      updated_at = now(),
      error_code = null,
      error_message = null
  where id = p_import_id;

  insert into public.salesforce_screenshot_import_events (import_id, event_type, event_data)
  values (p_import_id, 'import_completed', jsonb_build_object('propertyId', v_property_id));

  return v_result;
exception when others then
  -- The exception aborts all writes in this RPC, including this attempted
  -- status update. The API records the sanitized failure after the RPC returns.
  raise;
end;
$$;

revoke all on function public.commit_salesforce_screenshot_import(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.commit_salesforce_screenshot_import(uuid, text, jsonb, jsonb, text) to service_role;

-- Verification queries after running:
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'salesforce-imports';
-- select tablename, rowsecurity from pg_tables where schemaname='public' and tablename like 'salesforce_screenshot_import%';
-- select routine_name from information_schema.routines where routine_name='commit_salesforce_screenshot_import';
