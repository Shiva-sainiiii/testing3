-- Supabase only: stream changes so screens refresh instantly (polling is the fallback).
-- DEMO ONLY: no RLS, any client with the anon key can read synthetic data.
-- Production: enable RLS with policies scoped by hospital_id.
grant usage on schema tb to anon, authenticated;
grant select on tb.referrals, tb.referral_recipients, tb.messages, tb.audit_log, tb.home_queue to anon, authenticated;
alter publication supabase_realtime add table tb.referrals, tb.referral_recipients, tb.messages, tb.audit_log, tb.home_queue;
