-- =============================================================================
-- Esquema base: tenencia por clínica.
--
-- El tenant es la clínica. Cada fila de cada tabla de negocio lleva `clinic_id`,
-- y las políticas de la migración 20260801000200_rls.sql lo usan para aislar
-- los datos. Los índices sobre `clinic_id` no son opcionales: cada consulta de
-- la aplicación los atraviesa por la política RLS.
-- =============================================================================

-- Esquema privado para funciones auxiliares. No se expone a través de la Data
-- API de Supabase, a diferencia de `public`.
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Utilidad compartida: mantener `updated_at` al día.
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- clinics — el tenant
-- -----------------------------------------------------------------------------
create table public.clinics (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone   text not null default 'America/Mexico_City',
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);

comment on table public.clinics is
  'Tenant raíz. Se crea automáticamente al registrarse un dueño (trigger handle_new_user).';
comment on column public.clinics.timezone is
  'Identificador IANA. Toda la aritmética de horarios y huecos se hace en esta zona.';

-- -----------------------------------------------------------------------------
-- profiles — usuarios de la aplicación, uno a una clínica
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  full_name  text,
  role       text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create index profiles_clinic_id_idx on public.profiles (clinic_id);

comment on table public.profiles is
  'Vincula auth.users con su clínica. private.current_clinic_id() lee de aquí.';

-- -----------------------------------------------------------------------------
-- agent_configs — configuración del agente de voz, 1:1 con la clínica
-- -----------------------------------------------------------------------------
create table public.agent_configs (
  clinic_id            uuid primary key references public.clinics (id) on delete cascade,
  system_prompt        text not null default '',
  tone                 text not null default 'profesional y cálido',
  clinic_info          jsonb not null default '{}'::jsonb,
  services             jsonb not null default '[]'::jsonb,
  business_hours       jsonb not null default '{}'::jsonb,
  voice                jsonb not null default '{"provider":"azure","voiceId":"es-MX-DaliaNeural"}'::jsonb,
  transcriber          jsonb not null default '{"provider":"deepgram","model":"nova-2","language":"es"}'::jsonb,
  model                jsonb not null default '{"provider":"openai","model":"gpt-4.1"}'::jsonb,
  language             text not null default 'es',
  first_message        text not null default '',
  handoff_message      text not null default '',
  handoff_phone        text,
  hipaa_enabled        boolean not null default false,
  vapi_assistant_id    text,
  vapi_phone_number_id text,
  last_published_at    timestamptz,
  updated_at           timestamptz not null default now(),

  constraint agent_configs_services_is_array check (jsonb_typeof(services) = 'array'),
  constraint agent_configs_hours_is_object check (jsonb_typeof(business_hours) = 'object'),
  constraint agent_configs_info_is_object check (jsonb_typeof(clinic_info) = 'object')
);

-- Únicos: el webhook resuelve la clínica a partir de estos identificadores, así
-- que dos clínicas no pueden reclamar el mismo asistente o número. Sin esta
-- restricción, una clínica podría apuntar al número de otra y recibir sus datos.
create unique index agent_configs_vapi_assistant_id_key
  on public.agent_configs (vapi_assistant_id)
  where vapi_assistant_id is not null;

create unique index agent_configs_vapi_phone_number_id_key
  on public.agent_configs (vapi_phone_number_id)
  where vapi_phone_number_id is not null;

create trigger agent_configs_set_updated_at
  before update on public.agent_configs
  for each row execute function private.set_updated_at();

comment on column public.agent_configs.hipaa_enabled is
  'Activarlo hace que Vapi NO almacene grabaciones ni transcripciones: la vista de Transcripciones quedará vacía.';
comment on column public.agent_configs.vapi_phone_number_id is
  'UUID del número en Vapi (no el +52...). Es la clave por la que el webhook identifica la clínica.';

-- -----------------------------------------------------------------------------
-- google_credentials — tokens OAuth cifrados con AES-256-GCM
-- -----------------------------------------------------------------------------
create table public.google_credentials (
  clinic_id               uuid primary key references public.clinics (id) on delete cascade,
  access_token_encrypted  text not null,
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  scope                   text,
  calendar_id             text not null default 'primary',
  updated_at              timestamptz not null default now()
);

create trigger google_credentials_set_updated_at
  before update on public.google_credentials
  for each row execute function private.set_updated_at();

comment on table public.google_credentials is
  'Los tokens se guardan cifrados (lib/crypto.ts). Las columnas cifradas están
   además revocadas para el rol authenticated: el panel solo lee el estado de conexión.';

-- -----------------------------------------------------------------------------
-- calls — una fila por llamada telefónica atendida
-- -----------------------------------------------------------------------------
create table public.calls (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  vapi_call_id    text not null unique,
  started_at      timestamptz,
  ended_at        timestamptz,
  phone_number    text,
  status          text not null default 'ended',
  ended_reason    text,
  summary         text,
  full_transcript text,
  cost            numeric(10, 4),
  recording_url   text,
  created_at      timestamptz not null default now()
);

-- `vapi_call_id` es único para que un reenvío del end-of-call-report no duplique.
create index calls_clinic_started_idx on public.calls (clinic_id, started_at desc);

-- -----------------------------------------------------------------------------
-- appointments — citas agendadas
-- -----------------------------------------------------------------------------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics (id) on delete cascade,
  call_id         uuid references public.calls (id) on delete set null,
  google_event_id text,
  patient_name    text not null,
  patient_phone   text not null,
  patient_email   text,
  treatment       text not null,
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  is_new_patient  boolean not null default false,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'cancelled', 'completed')),
  notes           text,
  created_at      timestamptz not null default now(),

  constraint appointments_time_order check (end_time > start_time)
);

-- Idempotencia de reservas: dos citas activas no pueden ocupar el mismo hueco.
-- Es la red de seguridad frente a un reintento del agente o a dos llamadas
-- simultáneas pidiendo la misma hora; el webhook traduce el error 23505 a un
-- mensaje hablado en lugar de a un 500.
create unique index appointments_no_double_booking
  on public.appointments (clinic_id, start_time)
  where status = 'scheduled';

create unique index appointments_google_event_key
  on public.appointments (clinic_id, google_event_id)
  where google_event_id is not null;

create index appointments_clinic_start_idx on public.appointments (clinic_id, start_time);
create index appointments_call_id_idx on public.appointments (call_id);

-- -----------------------------------------------------------------------------
-- transcripts — conversación turno por turno
-- -----------------------------------------------------------------------------
create table public.transcripts (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics (id) on delete cascade,
  call_id            uuid not null references public.calls (id) on delete cascade,
  role               text not null check (role in ('assistant', 'user', 'system', 'tool')),
  text               text not null,
  seconds_from_start numeric,
  spoken_at          timestamptz,
  created_at         timestamptz not null default now()
);

create index transcripts_call_idx on public.transcripts (call_id, seconds_from_start);
create index transcripts_clinic_idx on public.transcripts (clinic_id);

comment on column public.transcripts.spoken_at is
  'Momento del turno. Se llama spoken_at y no "timestamp" para no chocar con el nombre de tipo de Postgres.';
