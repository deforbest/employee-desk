-- File: supabase/hint.sql | Version: 1.0.0 | Date: 2026-10-30
-- تشخیص هوشمند مرحلهٔ ورود: اگر ایمیل حسابی با رمز دارد، برنامه رمز می‌خواهد؛ وگرنه کد می‌فرستد.
-- برای جلوگیری از سوءاستفاده (حدس زدن ایمیل‌ها): هر ایمیل حداکثر ۶ بار در ۱۰ دقیقه و کل سامانه ۳۰۰ بار در دقیقه.
-- جواب فقط یکی از این‌هاست: password / code / limited. ایمیلِ ناموجود و ایمیلِ بدون رمز هر دو «code» برمی‌گردانند.
create table if not exists public.signin_hint_log (
  h  text not null,
  at timestamptz not null default now()
);
alter table public.signin_hint_log enable row level security;
revoke all on public.signin_hint_log from anon, authenticated;
create index if not exists signin_hint_log_at_idx on public.signin_hint_log (at);

create or replace function public.signin_hint(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  n int;
begin
  if length(e) < 5 or length(e) > 254 or position('@' in e) < 2 then return 'code'; end if;
  select count(*) into n from public.signin_hint_log where h = md5(e) and at > now() - interval '10 minutes';
  if n >= 6 then return 'limited'; end if;
  select count(*) into n from public.signin_hint_log where at > now() - interval '1 minute';
  if n >= 300 then return 'limited'; end if;
  insert into public.signin_hint_log (h) values (md5(e));
  delete from public.signin_hint_log where at < now() - interval '1 hour';
  if exists (select 1 from auth.users u where lower(u.email) = e and coalesce(u.raw_user_meta_data ->> 'has_password', '') = 'true') then
    return 'password';
  end if;
  return 'code';
end $$;
revoke all on function public.signin_hint(text) from public;
grant execute on function public.signin_hint(text) to anon, authenticated;
