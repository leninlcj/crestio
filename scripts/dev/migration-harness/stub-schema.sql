-- Minimal stand-in for the production schema, enough to run the agency chunk 5
-- migration and exercise its triggers locally. Not the real schema: only the
-- tables and columns the migration touches.
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text,
  owner_user_id uuid references auth.users(id)
);
create table public.organization_members (
  organization_id uuid references public.organizations(id),
  user_id uuid references auth.users(id),
  role text
);
create table public.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  billing_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create table public.parents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  auth_user_id uuid references auth.users(id),
  email text not null,
  name text
);
create table public.household_parents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  is_primary boolean not null default false
);
create table public.tutors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  name text,
  auth_user_id uuid
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  name text not null,
  hourly_rate_cents integer,
  household_id uuid references public.households(id) on delete set null
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  organization_id uuid references public.organizations(id),
  student_id uuid references public.students(id),
  household_id uuid references public.households(id) on delete set null,
  number text not null,
  issued_on date not null default current_date,
  due_on date,
  subtotal_cents integer not null default 0,
  total_cents integer not null default 0,
  status text not null default 'draft',
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  void_reason text,
  payment_token text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create or replace function public.is_org_member(org_id uuid) returns boolean language sql stable as $$ select true $$;
create or replace function public.is_org_owner(org_id uuid) returns boolean language sql stable as $$ select true $$;
