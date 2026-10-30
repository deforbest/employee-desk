-- File: supabase/security.sql | Version: 1.0.0 | Date: 2026-10-29
-- امنیت حساب: الزام تأیید دو مرحله‌ای (برای کسانی که فعالش کرده‌اند) + مدیریت نشست‌ها.

-- ۱) آیا این نشست اجازهٔ دسترسی به داده دارد؟ (اگر کاربر دو مرحله‌ای را فعال کرده، نشست باید سطح دوم باشد)
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- محدودکننده‌های سخت‌گیرانه: حتی اگر policy دیگری اجازه بدهد، نشست ناقص (فقط رمز یا کد ایمیل) دسترسی ندارد
drop policy if exists mfa_required on public.user_backups;
create policy mfa_required on public.user_backups as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());
drop policy if exists mfa_required on public.profiles;
create policy mfa_required on public.profiles as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

-- ۲) فهرست نشست‌های فعال خود کاربر (بدون نشان دادن IP)
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, aal text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at,
         coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) as last_active,
         s.user_agent, s.aal::text
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
    and public.mfa_ok()
  order by 3 desc;
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- ۳) حذف یک نشست دیگر (فقط نشست‌های خود کاربر)
create or replace function public.revoke_session(sid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.mfa_ok() then return false; end if;
  delete from auth.sessions where id = sid and user_id = auth.uid();
  return found;
end $$;
revoke all on function public.revoke_session(uuid) from public, anon;
grant execute on function public.revoke_session(uuid) to authenticated;
