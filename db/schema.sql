-- =====================================================================
-- TestBridge schema (Postgres 14+; works on Supabase and plain Postgres)
-- Re-runnable: drops and recreates schema "tb". ALL DATA IS SYNTHETIC.
--
-- Robustness rules:
--   * Every state change goes through a function below (one transaction).
--   * Every mutating function takes an idempotency key: retries and
--     double clicks return the stored result instead of acting twice.
--   * State changes are compare-and-set: UPDATE ... WHERE status = ANY(allowed)
--   * audit_log is append-only (trigger blocks UPDATE/DELETE).
-- =====================================================================

drop schema if exists tb cascade;
create schema tb;

create type tb.referral_status as enum (
  'open', 'accepted', 'patient_confirmed', 'arrived', 'test_done',
  'report_sent', 'closed', 'expired', 'cancelled', 'no_show'
);

-- ---------------------------------------------------------------- tables
create table tb.hospitals (
  id text primary key,                 -- 'A'..'F'
  name text not null,
  short_name text not null,
  kind text not null check (kind in ('govt', 'ppp')),
  lat double precision not null,
  lng double precision not null,
  address_en text not null,
  address_hi text not null,
  phone text not null
);

create table tb.test_types (
  id text primary key,                 -- 'MRI', 'CT', ...
  name_en text not null,
  name_hi text not null,
  sms_prep_en text not null,           -- one short line for SMS
  sms_prep_hi text not null,
  prep_en text not null,               -- full prep for status page / slip
  prep_hi text not null,
  bring_en text not null,
  bring_hi text not null
);

create table tb.hospital_tests (
  hospital_id text references tb.hospitals(id),
  test_type_id text references tb.test_types(id),
  is_free boolean not null,
  price_inr int,
  current_wait_days int not null,
  primary key (hospital_id, test_type_id)
);

create table tb.demo_users (
  id text primary key,
  name text not null,
  role text not null check (role in ('doctor', 'lab', 'dho', 'admin')),
  hospital_id text references tb.hospitals(id)
);

create table tb.patients (
  id text primary key default ('P' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  display_name text not null,
  age int,
  phone text not null unique,
  abha_id text,
  lang text not null default 'hi' check (lang in ('hi', 'en'))
);

-- Hospital A's own diagnostic queue (normally a paper register).
create table tb.home_queue (
  id bigserial primary key,
  hospital_id text not null references tb.hospitals(id),
  test_type_id text not null references tb.test_types(id),
  patient_id text not null references tb.patients(id),
  position int not null,
  slot_at timestamptz,
  status text not null check (status in ('waiting', 'booked', 'held_backup', 'released', 'used')),
  released_to_patient_id text references tb.patients(id),
  updated_at timestamptz not null default now()
);

create sequence tb.ref_code_seq start 1001;

create table tb.referrals (
  id bigserial primary key,
  code text not null unique default ('TB-' || nextval('tb.ref_code_seq')),
  patient_id text not null references tb.patients(id),
  from_hospital_id text not null references tb.hospitals(id),
  doctor_id text not null references tb.demo_users(id),
  test_type_id text not null references tb.test_types(id),
  priority text not null check (priority in ('P1', 'P2', 'P3')),
  on_temp_medication boolean not null default false,
  note text not null default '' check (length(note) <= 280),
  consent_recorded boolean not null check (consent_recorded),
  max_distance_km int not null check (max_distance_km between 1 and 100),
  radius_round int not null default 1,
  original_queue_id bigint references tb.home_queue(id),
  original_slot_at timestamptz not null,
  status tb.referral_status not null default 'open',
  version int not null default 0,
  accepted_hospital_id text references tb.hospitals(id),
  accepted_slot_at timestamptz,
  accepted_by text references tb.demo_users(id),
  accepted_at timestamptz,
  test_done_at timestamptz,
  patient_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- One active referral per patient + test (blocks duplicate submissions).
create unique index one_active_referral on tb.referrals (patient_id, test_type_id)
  where status not in ('closed', 'expired', 'cancelled');

create table tb.referral_recipients (
  referral_id bigint references tb.referrals(id),
  hospital_id text references tb.hospitals(id),
  distance_km numeric(6, 1) not null,
  round int not null default 1,
  response text check (response in ('accepted', 'lost_race', 'declined')),
  responded_at timestamptz,
  notified_at timestamptz not null,
  primary key (referral_id, hospital_id)
);

create table tb.reports (
  id bigserial primary key,
  referral_id bigint not null unique references tb.referrals(id),  -- one report per referral
  filename text not null,
  mime text not null,
  content bytea not null,
  reported_by_name text not null,
  reg_no text not null,
  uploaded_by text not null references tb.demo_users(id),
  uploaded_at timestamptz not null
);

create table tb.messages (
  id bigserial primary key,
  referral_id bigint references tb.referrals(id),
  patient_id text not null references tb.patients(id),
  direction text not null check (direction in ('out', 'in')),
  channel text not null default 'sms',
  body_hi text,
  body_en text not null,
  dedupe_key text not null unique,     -- e.g. 'accept:TB-1001:1' -> never sent twice
  created_at timestamptz not null
);

create table tb.audit_log (
  id bigserial primary key,
  at timestamptz not null,
  actor_id text,
  actor_name text not null,
  actor_role text not null,
  actor_hospital_id text,
  referral_id bigint,
  referral_code text,
  action text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}',
  idem_key text
);

create function tb.audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_no_update before update or delete on tb.audit_log
  for each row execute function tb.audit_immutable();

create table tb.idempotency (
  key text primary key,
  actor_id text,
  action text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create table tb.demo_clock (
  id int primary key check (id = 1),
  offset_interval interval not null default '0'
);
insert into tb.demo_clock values (1, '0');

-- ---------------------------------------------------------------- helpers
-- Demo clock: real time + an offset the admin can advance (expiry, reminders).
create function tb.app_now() returns timestamptz language sql stable as $$
  select now() + coalesce((select offset_interval from tb.demo_clock where id = 1), '0')
$$;

create function tb.km(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create function tb.fmt_ts(ts timestamptz) returns text language sql stable as $$
  select to_char(ts at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM')
$$;

create function tb.ist_date(ts timestamptz) returns date language sql stable as $$
  select (ts at time zone 'Asia/Kolkata')::date
$$;

create function tb.offer_window(p_priority text) returns interval language sql immutable as $$
  select case p_priority when 'P1' then interval '2 hours'
                         when 'P2' then interval '6 hours'
                         else interval '24 hours' end
$$;

-- Transparent urgency score. Every part is shown in the UI.
create function tb.score(p_priority text, p_temp boolean, p_created timestamptz, p_km numeric)
returns jsonb language plpgsql stable as $$
declare
  parts jsonb := '[]';
  total int := 0;
  pts int;
  days int;
begin
  pts := case p_priority when 'P1' then 100 when 'P2' then 50 else 10 end;
  parts := parts || jsonb_build_object('label', 'Priority ' || p_priority, 'pts', pts); total := total + pts;
  if p_temp then
    parts := parts || jsonb_build_object('label', 'On temporary medication', 'pts', 30); total := total + 30;
  end if;
  days := greatest(0, floor(extract(epoch from (tb.app_now() - p_created)) / 86400))::int;
  if days > 0 then
    parts := parts || jsonb_build_object('label', 'Waiting ' || days || 'd', 'pts', days * 2); total := total + days * 2;
  end if;
  if p_km is not null then
    pts := -round(p_km)::int;
    parts := parts || jsonb_build_object('label', p_km || ' km away', 'pts', pts); total := total + pts;
  end if;
  return jsonb_build_object('total', total, 'parts', parts);
end $$;

create function tb.audit(
  p_actor text, p_ref bigint, p_action text,
  p_from tb.referral_status, p_to tb.referral_status,
  p_details jsonb default '{}', p_idem text default null, p_role text default null
) returns void language plpgsql as $$
declare
  u tb.demo_users;
  v_code text;
begin
  select * into u from tb.demo_users where id = p_actor;
  select code into v_code from tb.referrals where id = p_ref;
  insert into tb.audit_log (at, actor_id, actor_name, actor_role, actor_hospital_id,
                            referral_id, referral_code, action, from_status, to_status, details, idem_key)
  values (tb.app_now(), u.id, coalesce(u.name, initcap(coalesce(p_role, 'system'))),
          coalesce(p_role, u.role, 'system'), u.hospital_id,
          p_ref, v_code, p_action, p_from::text, p_to::text, coalesce(p_details, '{}'), p_idem);
end $$;

create function tb.send_msg(p_patient text, p_ref bigint, p_dedupe text, p_hi text, p_en text)
returns void language sql as $$
  insert into tb.messages (referral_id, patient_id, direction, body_hi, body_en, dedupe_key, created_at)
  values (p_ref, p_patient, 'out', p_hi, p_en, p_dedupe, tb.app_now())
  on conflict (dedupe_key) do nothing
$$;

-- Idempotency: returns the stored result if this key was already used, else NULL.
-- A concurrent duplicate blocks on the INSERT until the first commits, then sees it.
create function tb.idem_begin(p_key text, p_actor text, p_action text) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  if p_key is null or length(p_key) < 8 then
    raise exception 'idempotency key required';
  end if;
  insert into tb.idempotency (key, actor_id, action) values (p_key, p_actor, p_action)
  on conflict (key) do nothing;
  if found then return null; end if;
  select coalesce(result, '{"ok":false,"reason":"in_progress","message":"Still processing, please wait"}')
    into v from tb.idempotency where key = p_key;
  return v || '{"replayed":true}';
end $$;

create function tb.idem_end(p_key text, p_result jsonb) returns jsonb language sql as $$
  update tb.idempotency set result = p_result where key = p_key;
  select p_result;
$$;

create function tb.fail(p_key text, p_reason text, p_message text, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select tb.idem_end(p_key, jsonb_build_object('ok', false, 'reason', p_reason, 'message', p_message) || p_extra)
$$;

-- Add labs (offering the test, within radius, not the sender) as recipients.
create function tb.add_recipients(p_ref bigint, p_round int) returns int language plpgsql as $$
declare n int;
begin
  insert into tb.referral_recipients (referral_id, hospital_id, distance_km, round, notified_at)
  select r.id, h.id, round(tb.km(a.lat, a.lng, h.lat, h.lng)::numeric, 1), p_round, tb.app_now()
  from tb.referrals r
  join tb.hospitals a on a.id = r.from_hospital_id
  join tb.hospital_tests ht on ht.test_type_id = r.test_type_id
  join tb.hospitals h on h.id = ht.hospital_id
  where r.id = p_ref and h.id <> a.id
    and tb.km(a.lat, a.lng, h.lat, h.lng) <= r.max_distance_km
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- create
create function tb.create_referral(p_actor text, p_idem text, p jsonb) returns jsonb
language plpgsql as $$
declare
  v jsonb;
  u tb.demo_users;
  pat tb.patients;
  hq tb.home_queue;
  r tb.referrals;
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  v_orig timestamptz;
  v_wait int := nullif(p->>'wait_days', '')::int;
  v_existing text;
  n int;
begin
  v := tb.idem_begin(p_idem, p_actor, 'create_referral');
  if v is not null then return v; end if;

  select * into u from tb.demo_users where id = p_actor;
  if u.role is distinct from 'doctor' then
    return tb.fail(p_idem, 'forbidden', 'Only a referring doctor can create a referral');
  end if;
  if not coalesce((p->>'consent')::boolean, false) then
    return tb.fail(p_idem, 'consent_required', 'Record the patient''s consent before sharing details with partner labs');
  end if;
  if length(v_phone) = 12 and v_phone like '91%' then v_phone := substr(v_phone, 3); end if;
  if length(v_phone) <> 10 then
    return tb.fail(p_idem, 'bad_phone', 'Enter a 10-digit mobile number');
  end if;
  if coalesce(p->>'priority', '') not in ('P1', 'P2', 'P3') then
    return tb.fail(p_idem, 'bad_priority', 'Choose a priority');
  end if;
  if length(coalesce(p->>'note', '')) > 280 then
    return tb.fail(p_idem, 'note_too_long', 'Note must be 280 characters or less');
  end if;

  select * into pat from tb.patients where phone = v_phone;
  if not found then
    if coalesce(trim(p->>'name'), '') = '' then
      return tb.fail(p_idem, 'name_required', 'New patient: enter the patient''s name');
    end if;
    insert into tb.patients (display_name, phone, abha_id, lang)
    values (trim(p->>'name'), v_phone, nullif(trim(p->>'abha'), ''), coalesce(nullif(p->>'lang', ''), 'hi'))
    returning * into pat;
  elsif coalesce(trim(p->>'abha'), '') <> '' then
    update tb.patients set abha_id = trim(p->>'abha') where id = pat.id returning * into pat;
  end if;

  select * into hq from tb.home_queue
  where hospital_id = u.hospital_id and test_type_id = p->>'test' and patient_id = pat.id and status = 'booked'
  order by slot_at limit 1;
  if found then
    v_orig := hq.slot_at;
  elsif v_wait is not null and v_wait > 0 then
    v_orig := tb.app_now() + make_interval(days => v_wait);
  else
    return tb.fail(p_idem, 'wait_required', 'Patient has no slot in your queue: enter your current wait in days');
  end if;

  begin
    insert into tb.referrals (patient_id, from_hospital_id, doctor_id, test_type_id, priority,
      on_temp_medication, note, consent_recorded, max_distance_km, original_queue_id, original_slot_at,
      expires_at, created_at, updated_at)
    values (pat.id, u.hospital_id, u.id, p->>'test', p->>'priority',
      coalesce((p->>'temp_med')::boolean, false), coalesce(p->>'note', ''), true,
      coalesce(nullif(p->>'max_km', '')::int, 25), hq.id, v_orig,
      tb.app_now() + tb.offer_window(p->>'priority'), tb.app_now(), tb.app_now())
    returning * into r;
  exception when unique_violation then
    select code into v_existing from tb.referrals
    where patient_id = pat.id and test_type_id = p->>'test' and status not in ('closed', 'expired', 'cancelled')
    limit 1;
    return tb.fail(p_idem, 'duplicate_active',
      'This patient already has an active referral for this test (' || coalesce(v_existing, '?') || ')',
      jsonb_build_object('code', v_existing));
  end;

  n := tb.add_recipients(r.id, 1);

  perform tb.audit(p_actor, r.id, 'consent_recorded', null, null,
    jsonb_build_object('method', 'verbal, script read by doctor'), p_idem);
  perform tb.audit(p_actor, r.id, 'created', null, 'open', jsonb_build_object(
    'test', r.test_type_id, 'priority', r.priority, 'temp_med', r.on_temp_medication,
    'max_km', r.max_distance_km, 'labs_notified', n,
    'original_slot', tb.fmt_ts(r.original_slot_at)), p_idem);

  perform tb.send_msg(pat.id, r.id, 'created:' || r.code,
    'TestBridge: डॉक्टर ने आपकी ' || (select name_hi from tb.test_types where id = r.test_type_id) ||
      ' जाँच के लिए जल्दी की तारीख माँगी है। तारीख तय होते ही SMS आएगा। आपकी पुरानी तारीख ' ||
      tb.fmt_ts(r.original_slot_at) || ' सुरक्षित है।',
    'TestBridge: Your doctor has requested an earlier ' || r.test_type_id ||
      ' slot. We will SMS you when it is booked. Your original date ' || tb.fmt_ts(r.original_slot_at) || ' is kept.');

  return tb.idem_end(p_idem, jsonb_build_object('ok', true, 'id', r.id, 'code', r.code, 'labs_notified', n));
end $$;

-- ---------------------------------------------------------------- accept (atomic)
create function tb.accept_referral(p_actor text, p_idem text, p_ref bigint, p_slot timestamptz)
returns jsonb language plpgsql as $$
declare
  v jsonb;
  u tb.demo_users;
  r tb.referrals;
  h tb.hospitals;
  t tb.test_types;
  winner text;
  n int;
begin
  v := tb.idem_begin(p_idem, p_actor, 'accept_referral');
  if v is not null then return v; end if;

  select * into u from tb.demo_users where id = p_actor;
  if u.role is distinct from 'lab' then
    return tb.fail(p_idem, 'forbidden', 'Only a lab desk can accept');
  end if;
  if p_slot is null or p_slot <= tb.app_now() then
    return tb.fail(p_idem, 'bad_slot', 'Pick a date and time in the future');
  end if;

  -- Compare-and-set: only succeeds while the referral is still open.
  -- Concurrent accepts serialise on the row lock; the loser re-checks status and updates 0 rows.
  update tb.referrals
     set status = 'accepted', accepted_hospital_id = u.hospital_id, accepted_slot_at = p_slot,
         accepted_by = u.id, accepted_at = tb.app_now(), version = version + 1, updated_at = tb.app_now()
   where id = p_ref and status = 'open' and expires_at > tb.app_now()
     and exists (select 1 from tb.referral_recipients rr
                 where rr.referral_id = p_ref and rr.hospital_id = u.hospital_id
                   and rr.response is distinct from 'declined')
  returning * into r;

  if not found then
    select * into r from tb.referrals where id = p_ref;
    if not found then
      return tb.fail(p_idem, 'not_found', 'Referral not found');
    end if;
    if r.accepted_hospital_id = u.hospital_id and r.status <> 'open' then
      return tb.idem_end(p_idem, jsonb_build_object('ok', true, 'code', r.code, 'already', true,
        'message', 'Already accepted by your lab'));
    end if;
    select short_name into winner from tb.hospitals where id = r.accepted_hospital_id;
    update tb.referral_recipients set response = 'lost_race', responded_at = tb.app_now()
     where referral_id = p_ref and hospital_id = u.hospital_id and response is null;
    perform tb.audit(p_actor, p_ref, 'accept_rejected', r.status, r.status,
      jsonb_build_object('reason', case when r.status = 'open' then 'expired_or_not_recipient' else 'already_' || r.status end,
                         'winner', winner), p_idem);
    if r.status = 'open' then
      return tb.fail(p_idem, 'expired', 'This request has expired or was not sent to your lab');
    end if;
    return tb.fail(p_idem, 'already_accepted',
      case when winner is not null then 'Already accepted by ' || winner else 'Request is ' || r.status end,
      jsonb_build_object('by', winner));
  end if;

  update tb.referral_recipients set response = 'accepted', responded_at = tb.app_now()
   where referral_id = p_ref and hospital_id = u.hospital_id;

  select * into h from tb.hospitals where id = u.hospital_id;
  select * into t from tb.test_types where id = r.test_type_id;

  perform tb.audit(p_actor, p_ref, 'accepted', 'open', 'accepted',
    jsonb_build_object('lab', h.short_name, 'slot', tb.fmt_ts(p_slot)), p_idem);

  update tb.home_queue set status = 'held_backup', updated_at = tb.app_now()
   where id = r.original_queue_id and status = 'booked';
  get diagnostics n = row_count;
  if n > 0 then
    perform tb.audit(p_actor, p_ref, 'original_slot_held', null, null,
      jsonb_build_object('slot', tb.fmt_ts(r.original_slot_at), 'note', 'kept as backup until test is done'), p_idem);
  end if;

  perform tb.send_msg(r.patient_id, r.id, 'accept:' || r.code || ':' || r.version,
    'TestBridge: आपकी ' || t.name_hi || ' जाँच ' || h.name || ' में ' || tb.fmt_ts(p_slot) ||
      ' पर तय है। टोकन ' || r.code || '। ' || t.sms_prep_hi || ' पुष्टि के लिए 1 भेजें। /s/' || r.patient_token,
    'TestBridge: Your ' || t.name_en || ' is booked at ' || h.name || ' on ' || tb.fmt_ts(p_slot) ||
      '. Token ' || r.code || '. ' || t.sms_prep_en || ' Reply 1 to confirm. /s/' || r.patient_token);

  return tb.idem_end(p_idem, jsonb_build_object('ok', true, 'code', r.code, 'lab', h.short_name));
end $$;

create function tb.decline_referral(p_actor text, p_idem text, p_ref bigint, p_reason text)
returns jsonb language plpgsql as $$
declare v jsonb; u tb.demo_users; n int;
begin
  v := tb.idem_begin(p_idem, p_actor, 'decline_referral');
  if v is not null then return v; end if;
  select * into u from tb.demo_users where id = p_actor;
  update tb.referral_recipients set response = 'declined', responded_at = tb.app_now()
   where referral_id = p_ref and hospital_id = u.hospital_id and response is null;
  get diagnostics n = row_count;
  if n = 0 then return tb.fail(p_idem, 'invalid', 'Nothing to decline'); end if;
  perform tb.audit(p_actor, p_ref, 'declined', null, null, jsonb_build_object('reason', coalesce(p_reason, '')), p_idem);
  return tb.idem_end(p_idem, '{"ok":true}');
end $$;

-- ---------------------------------------------------------------- slot release
create function tb.release_original_slot(p_actor text, r tb.referrals, p_idem text) returns void
language plpgsql as $$
declare q tb.home_queue; nxt tb.home_queue; nxt_name text; t tb.test_types; a tb.hospitals;
begin
  update tb.home_queue set status = 'released', updated_at = tb.app_now()
   where id = r.original_queue_id and status in ('held_backup', 'booked')
  returning * into q;
  if not found then return; end if;

  select * into nxt from tb.home_queue
   where hospital_id = q.hospital_id and test_type_id = q.test_type_id and status = 'waiting'
   order by position limit 1 for update skip locked;
  if found then
    update tb.home_queue set status = 'booked', slot_at = q.slot_at, updated_at = tb.app_now() where id = nxt.id;
    update tb.home_queue set released_to_patient_id = nxt.patient_id where id = q.id;
    select display_name into nxt_name from tb.patients where id = nxt.patient_id;
    select * into t from tb.test_types where id = q.test_type_id;
    select * into a from tb.hospitals where id = q.hospital_id;
    perform tb.send_msg(nxt.patient_id, null, 'slot:' || q.id,
      'TestBridge: ' || a.name || ' में आपकी ' || t.name_hi || ' जाँच की तारीख पहले मिल गई है: ' || tb.fmt_ts(q.slot_at) || '।',
      'TestBridge: An earlier ' || t.name_en || ' slot opened at ' || a.name || ': ' || tb.fmt_ts(q.slot_at) || '.');
  end if;
  perform tb.audit(p_actor, r.id, 'original_slot_released', null, null,
    jsonb_build_object('slot', tb.fmt_ts(q.slot_at), 'given_to', coalesce(nxt_name, 'no one waiting')), p_idem);
end $$;

-- ---------------------------------------------------------------- transitions
create function tb.transition_referral(p_actor text, p_idem text, p_ref bigint, p_to text, p_details jsonb default '{}')
returns jsonb language plpgsql as $$
declare
  v jsonb;
  u tb.demo_users;
  r tb.referrals;
  cur tb.referrals;
  allowed tb.referral_status[];
  is_lab_action boolean;
  t tb.test_types;
  a tb.hospitals;
begin
  v := tb.idem_begin(p_idem, p_actor, 'transition:' || p_to);
  if v is not null then return v; end if;
  select * into u from tb.demo_users where id = p_actor;

  allowed := case p_to
    when 'arrived'   then array['accepted', 'patient_confirmed']::tb.referral_status[]
    when 'test_done' then array['arrived']::tb.referral_status[]
    when 'no_show'   then array['accepted', 'patient_confirmed']::tb.referral_status[]
    when 'cancelled' then array['open', 'accepted', 'patient_confirmed']::tb.referral_status[]
    when 'closed'    then array['report_sent']::tb.referral_status[]
    else null end;
  if allowed is null then
    return tb.fail(p_idem, 'bad_transition', 'Unknown action ' || p_to);
  end if;
  is_lab_action := p_to in ('arrived', 'test_done', 'no_show');
  select * into cur from tb.referrals where id = p_ref for update;  -- lock; remember the from-state

  -- Compare-and-set with ownership in the WHERE clause (no check-then-act race).
  update tb.referrals
     set status = p_to::tb.referral_status, version = version + 1, updated_at = tb.app_now(),
         test_done_at = case when p_to = 'test_done' then tb.app_now() else test_done_at end
   where id = p_ref and status = any(allowed)
     and (case when is_lab_action then u.role = 'lab' and accepted_hospital_id = u.hospital_id
               else u.role = 'doctor' and from_hospital_id = u.hospital_id end)
  returning * into r;

  if not found then
    perform tb.audit(p_actor, p_ref, 'transition_rejected', cur.status, null,
      jsonb_build_object('attempted', p_to), p_idem);
    return tb.fail(p_idem, 'invalid_transition',
      'Cannot mark as ' || replace(p_to, '_', ' ') || ': referral is ' || coalesce(replace(cur.status::text, '_', ' '), 'missing'));
  end if;

  perform tb.audit(p_actor, p_ref, p_to, cur.status, p_to::tb.referral_status, coalesce(p_details, '{}'), p_idem);
  select * into t from tb.test_types where id = r.test_type_id;
  select * into a from tb.hospitals where id = r.from_hospital_id;

  if p_to = 'test_done' then
    perform tb.release_original_slot(p_actor, r, p_idem);

  elsif p_to = 'no_show' then
    -- Back to open; original slot was never released, so the patient loses nothing.
    update tb.referrals
       set status = 'open', accepted_hospital_id = null, accepted_slot_at = null, accepted_by = null,
           accepted_at = null, version = version + 1, updated_at = tb.app_now(),
           expires_at = tb.app_now() + tb.offer_window(priority)
     where id = p_ref;
    update tb.referral_recipients set response = null, responded_at = null
     where referral_id = p_ref and response in ('accepted', 'lost_race');
    perform tb.audit(null, p_ref, 'reopened', 'no_show', 'open',
      jsonb_build_object('reason', 'no-show; offered to labs again'), p_idem, 'system');
    perform tb.send_msg(r.patient_id, r.id, 'noshow:' || r.code || ':' || r.version,
      'TestBridge: आप जाँच के लिए नहीं पहुँचे। आपकी पुरानी तारीख ' || tb.fmt_ts(r.original_slot_at) || ' सुरक्षित है। नई तारीख मिलने पर SMS आएगा।',
      'TestBridge: You missed your test. Your original date ' || tb.fmt_ts(r.original_slot_at) || ' is still kept. We will SMS a new slot.');

  elsif p_to = 'cancelled' then
    update tb.home_queue set status = 'booked', updated_at = tb.app_now()
     where id = r.original_queue_id and status = 'held_backup';
    perform tb.send_msg(r.patient_id, r.id, 'cancel:' || r.code,
      'TestBridge: अनुरोध रद्द। अपनी पुरानी तारीख ' || tb.fmt_ts(r.original_slot_at) || ' पर ' || a.name || ' आएँ।',
      'TestBridge: Request cancelled. Please come to ' || a.name || ' on your original date ' || tb.fmt_ts(r.original_slot_at) || '.');
  end if;

  return tb.idem_end(p_idem, jsonb_build_object('ok', true, 'status', p_to));
end $$;

-- ---------------------------------------------------------------- report
create function tb.attach_report(p_actor text, p_idem text, p_ref bigint, p_filename text, p_mime text,
                                 p_content bytea, p_reported_by text, p_reg_no text)
returns jsonb language plpgsql as $$
declare v jsonb; u tb.demo_users; r tb.referrals; a tb.hospitals; d tb.demo_users; days int;
begin
  v := tb.idem_begin(p_idem, p_actor, 'attach_report');
  if v is not null then return v; end if;
  select * into u from tb.demo_users where id = p_actor;

  select * into r from tb.referrals where id = p_ref for update;
  if not found or u.role <> 'lab' or r.accepted_hospital_id is distinct from u.hospital_id then
    return tb.fail(p_idem, 'forbidden', 'Only the lab that did the test can upload the report');
  end if;
  if exists (select 1 from tb.reports where referral_id = p_ref) then
    return tb.fail(p_idem, 'duplicate_report', 'A report is already uploaded for ' || r.code);
  end if;
  if r.status <> 'test_done' then
    return tb.fail(p_idem, 'invalid_transition', 'Mark the test as done before uploading the report');
  end if;
  if coalesce(trim(p_reported_by), '') = '' or coalesce(trim(p_reg_no), '') = '' then
    return tb.fail(p_idem, 'missing_fields', 'Enter the reporting doctor''s name and registration number');
  end if;

  insert into tb.reports (referral_id, filename, mime, content, reported_by_name, reg_no, uploaded_by, uploaded_at)
  values (p_ref, p_filename, p_mime, p_content, trim(p_reported_by), trim(p_reg_no), u.id, tb.app_now());

  update tb.referrals set status = 'report_sent', version = version + 1, updated_at = tb.app_now() where id = p_ref;
  days := tb.ist_date(r.original_slot_at) - tb.ist_date(r.test_done_at);
  perform tb.audit(p_actor, p_ref, 'report_sent', 'test_done', 'report_sent',
    jsonb_build_object('reported_by', trim(p_reported_by), 'reg_no', trim(p_reg_no), 'days_earlier', days), p_idem);

  select * into a from tb.hospitals where id = r.from_hospital_id;
  select * into d from tb.demo_users where id = r.doctor_id;
  perform tb.send_msg(r.patient_id, r.id, 'report:' || r.code,
    'TestBridge: आपकी रिपोर्ट ' || d.name || ' (' || a.name || ') को भेज दी गई है। इलाज वहीं जारी रखें।',
    'TestBridge: Your report has been sent to ' || d.name || ' at ' || a.name || '. Continue your treatment there.');

  return tb.idem_end(p_idem, jsonb_build_object('ok', true, 'days_earlier', days));
end $$;

-- ---------------------------------------------------------------- patient SMS reply
create function tb.patient_reply(p_patient text, p_idem text, p_body text) returns jsonb
language plpgsql as $$
declare v jsonb; r tb.referrals; body text := lower(trim(coalesce(p_body, '')));
begin
  v := tb.idem_begin(p_idem, 'patient:' || p_patient, 'patient_reply');
  if v is not null then return v; end if;

  insert into tb.messages (patient_id, direction, body_en, dedupe_key, created_at)
  values (p_patient, 'in', trim(p_body), 'in:' || p_idem, tb.app_now());

  if body in ('1', 'yes', 'y', 'ok', 'haan', 'ha', 'हाँ', 'हां') then
    update tb.referrals set status = 'patient_confirmed', version = version + 1, updated_at = tb.app_now()
     where id = (select id from tb.referrals where patient_id = p_patient and status = 'accepted'
                 order by accepted_at desc limit 1)
       and status = 'accepted'
    returning * into r;
    if found then
      perform tb.audit(null, r.id, 'patient_confirmed', 'accepted', 'patient_confirmed',
        jsonb_build_object('via', 'SMS reply'), p_idem, 'patient');
      perform tb.send_msg(p_patient, r.id, 'reply:' || p_idem,
        'TestBridge: धन्यवाद, आपकी जाँच ' || tb.fmt_ts(r.accepted_slot_at) || ' के लिए पक्की है।',
        'TestBridge: Thank you, your test on ' || tb.fmt_ts(r.accepted_slot_at) || ' is confirmed.');
      return tb.idem_end(p_idem, jsonb_build_object('ok', true, 'confirmed', r.code));
    end if;
  end if;

  perform tb.send_msg(p_patient, null, 'reply:' || p_idem,
    'TestBridge: पुष्टि के लिए 1 भेजें। मदद के लिए अपने अस्पताल से संपर्क करें।',
    'TestBridge: Reply 1 to confirm a booked test. For help, contact your hospital.');
  return tb.idem_end(p_idem, '{"ok":true,"confirmed":null}');
end $$;

-- ---------------------------------------------------------------- timers (expiry, widen, reminders)
create function tb.process_timers() returns jsonb language plpgsql as $$
declare r tb.referrals; n_widen int := 0; n_exp int := 0; n_rem int := 0; added int; a tb.hospitals;
begin
  for r in select * from tb.referrals where status = 'open' and expires_at <= tb.app_now() for update skip locked loop
    if r.radius_round = 1 then
      update tb.referrals
         set radius_round = 2, max_distance_km = least(100, max_distance_km * 2),
             expires_at = tb.app_now() + tb.offer_window(priority), version = version + 1, updated_at = tb.app_now()
       where id = r.id;
      added := tb.add_recipients(r.id, 2);
      perform tb.audit(null, r.id, 'radius_widened', 'open', 'open',
        jsonb_build_object('from_km', r.max_distance_km, 'to_km', least(100, r.max_distance_km * 2), 'new_labs', added),
        null, 'system');
      n_widen := n_widen + 1;
    else
      update tb.referrals set status = 'expired', version = version + 1, updated_at = tb.app_now() where id = r.id;
      update tb.home_queue set status = 'booked', updated_at = tb.app_now()
       where id = r.original_queue_id and status = 'held_backup';
      perform tb.audit(null, r.id, 'expired', 'open', 'expired',
        jsonb_build_object('note', 'no lab accepted; patient keeps original date'), null, 'system');
      select * into a from tb.hospitals where id = r.from_hospital_id;
      perform tb.send_msg(r.patient_id, r.id, 'expired:' || r.code,
        'TestBridge: अभी पास में जल्दी की तारीख नहीं मिली। अपनी पुरानी तारीख ' || tb.fmt_ts(r.original_slot_at) || ' पर ' || a.name || ' आएँ।',
        'TestBridge: No earlier slot was found nearby. Please keep your original date ' || tb.fmt_ts(r.original_slot_at) || ' at ' || a.name || '.');
      n_exp := n_exp + 1;
    end if;
  end loop;

  -- Day-before reminder (dedupe key makes it send once per booking).
  with due as (
    select r2.* from tb.referrals r2
     where r2.status in ('accepted', 'patient_confirmed')
       and r2.accepted_slot_at between tb.app_now() and tb.app_now() + interval '24 hours'
       and not exists (select 1 from tb.messages m where m.dedupe_key = 'remind:' || r2.code || ':' || r2.version)
  ), ins as (
    insert into tb.messages (referral_id, patient_id, direction, body_hi, body_en, dedupe_key, created_at)
    select d.id, d.patient_id, 'out',
      'TestBridge याद दिलाना: कल ' || tb.fmt_ts(d.accepted_slot_at) || ' आपकी जाँच है। टोकन ' || d.code || '। आ रहे हैं तो 1 भेजें।',
      'TestBridge reminder: your test is on ' || tb.fmt_ts(d.accepted_slot_at) || '. Token ' || d.code || '. Reply 1 if you are coming.',
      'remind:' || d.code || ':' || d.version, tb.app_now()
    from due d
    on conflict (dedupe_key) do nothing
    returning 1
  ) select count(*) into n_rem from ins;

  return jsonb_build_object('widened', n_widen, 'expired', n_exp, 'reminders', n_rem);
end $$;

create function tb.advance_clock(p_actor text, p_hours int) returns jsonb language plpgsql as $$
declare res jsonb;
begin
  update tb.demo_clock set offset_interval = offset_interval + make_interval(hours => p_hours) where id = 1;
  perform tb.audit(p_actor, null, 'demo_clock_advanced', null, null, jsonb_build_object('hours', p_hours));
  res := tb.process_timers();
  return jsonb_build_object('ok', true) || res;
end $$;

create function tb.log_view(p_actor text, p_ref bigint, p_what text) returns void language sql as $$
  select tb.audit(p_actor, p_ref, 'viewed_' || p_what, null, null, '{}')
$$;
