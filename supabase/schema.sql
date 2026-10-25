-- File: supabase/schema.sql | Version: 1.0.0 | Date: 2026-10-25
-- یک‌بار در Supabase > SQL Editor اجرا کنید. همهٔ جدول‌ها RLS دارند؛ یعنی هر کاربر فقط داده‌های خودش را می‌بیند.

-- ۱) پروفایل کاربر
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone        text,                 -- فقط سرور (تابع تلگرام) می‌نویسد؛ کاربر نمی‌تواند دستکاری کند
  telegram_id  bigint unique,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ۲) پشتیبان ابری داده‌های برنامه (یک ردیف برای هر کاربر)
create table if not exists public.user_backups (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_backups_size check (pg_column_size(data) < 2000000)
);
alter table public.user_backups enable row level security;
revoke all on public.user_backups from anon, authenticated;
grant select, insert, update, delete on public.user_backups to authenticated;
drop policy if exists user_backups_own on public.user_backups;
create policy user_backups_own on public.user_backups for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ۳) درخواست‌های ورود با تلگرام/شماره (فقط توابع سرور؛ هیچ دسترسی از مرورگر)
create table if not exists public.tg_login_requests (
  id          uuid primary key default gen_random_uuid(),
  purpose     text not null check (purpose in ('login', 'phone')),
  challenge   text not null check (challenge ~ '^[0-9a-f]{64}$'),
  status      text not null default 'pending' check (status in ('pending', 'awaiting_phone', 'verified')),
  tg_id       bigint,
  tg_name     text,
  tg_username text,
  chat_id     bigint,
  phone       text,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes'
);
alter table public.tg_login_requests enable row level security;   -- بدون policy = بسته برای همه جز service_role
revoke all on public.tg_login_requests from anon, authenticated;
create index if not exists tg_login_requests_created_idx on public.tg_login_requests (created_at);
