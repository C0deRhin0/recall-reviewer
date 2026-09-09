-- Apply through the Supabase SQL editor or CLI using a migration credential.
-- Browser roles have no access to content, answers, sessions or progress.
create schema if not exists reviewer_private;
revoke all on schema reviewer_private from public, anon, authenticated;
create table reviewer_private.documents (
  key text primary key check (length(key) <= 240),
  revision bigint not null default 1,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table reviewer_private.documents enable row level security;
revoke all on reviewer_private.documents from public, anon, authenticated, service_role;

create or replace function public.reviewer_read(document_key text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('revision',revision,'value',value)
  from reviewer_private.documents where key = document_key;
$$;
create or replace function public.reviewer_write(document_key text, expected_revision bigint, document_value jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if length(document_key) > 240 or octet_length(document_value::text) > 16000000 then
    raise exception 'Document exceeds permitted size';
  end if;
  if expected_revision = 0 then
    insert into reviewer_private.documents(key,revision,value) values(document_key,1,document_value) on conflict do nothing;
  else
    update reviewer_private.documents set value=document_value,revision=revision+1,updated_at=now()
      where key=document_key and revision=expected_revision;
  end if;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
create or replace function public.reviewer_session_active(session_uuid uuid, user_uuid uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions where id=session_uuid and user_id=user_uuid);
$$;
revoke all on function public.reviewer_read(text) from public, anon, authenticated;
revoke all on function public.reviewer_write(text,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.reviewer_session_active(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reviewer_read(text) to service_role;
grant execute on function public.reviewer_write(text,bigint,jsonb) to service_role;
grant execute on function public.reviewer_session_active(uuid,uuid) to service_role;
-- Review follow-up details for 001 reviewer
-- Refine the surrounding context for 001 reviewer
