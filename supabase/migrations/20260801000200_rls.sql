-- =============================================================================
-- Row Level Security: aislamiento estricto por clínica.
--
-- Modelo de amenaza: el tráfico real de la API llega con los roles `anon` y
-- `authenticated`, y ambos están sujetos a RLS. El rol `service_role` (que usa
-- únicamente el webhook de Vapi, sin sesión de usuario) SALTA RLS por diseño;
-- allí el aislamiento se garantiza en la aplicación, en lib/tenant/scoped-admin.ts.
--
-- Nota sobre FORCE ROW LEVEL SECURITY: no se activa a propósito. FORCE somete
-- también al propietario de la tabla (`postgres`), que es quien ejecuta el
-- trigger SECURITY DEFINER `handle_new_user` al registrarse un dueño; activarlo
-- puede bloquear el alta. Tampoco añade protección real frente al modelo de
-- amenaza, porque `service_role` tiene el atributo BYPASSRLS de todas formas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Función auxiliar de tenencia.
--
-- Vive en `private` y no en `public` porque Postgres concede EXECUTE a PUBLIC
-- en cada función nueva: una función SECURITY DEFINER en `public` sería un
-- endpoint invocable por `anon` sin ninguna concesión adicional. Además
-- `private` no se expone a través de la Data API.
--
-- Es SECURITY DEFINER para poder leer `profiles` saltándose la RLS de esa misma
-- tabla, lo que evita la recursión infinita al usarla en la política de profiles.
-- -----------------------------------------------------------------------------
create or replace function private.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select clinic_id
  from public.profiles
  where id = (select auth.uid());
$$;

revoke execute on function private.current_clinic_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_clinic_id() to authenticated;

comment on function private.current_clinic_id() is
  'Clínica del usuario autenticado. Se invoca envuelta en subconsulta -- (select private.current_clinic_id()) -- para que Postgres la evalúe una vez por consulta y no una vez por fila.';

-- =============================================================================
-- Privilegios de columna
--
-- Supabase concede ALL sobre las tablas nuevas de `public` a anon y
-- authenticated. Se revoca todo y se concede solo lo necesario, de modo que RLS
-- filtre filas y los privilegios de columna limiten qué campos puede tocar el
-- panel. Esto cierra dos vías de escalada que RLS por sí sola no cubre:
--   * profiles.role      -> un `staff` no puede ascenderse a `owner`
--   * agent_configs.vapi_* -> el identificador por el que el webhook resuelve la
--     clínica solo lo escribe el servidor tras publicar en Vapi
-- =============================================================================

revoke all on public.clinics, public.profiles, public.agent_configs,
              public.google_credentials, public.calls, public.appointments,
              public.transcripts
  from anon, authenticated;

grant select                                        on public.clinics       to authenticated;
grant update (name, timezone, phone, address)       on public.clinics       to authenticated;

grant select                                        on public.profiles      to authenticated;
grant update (full_name)                            on public.profiles      to authenticated;

grant select                                        on public.agent_configs to authenticated;
grant update (system_prompt, tone, clinic_info, services, business_hours,
              voice, transcriber, model, language, first_message,
              handoff_message, handoff_phone, hipaa_enabled)
                                                    on public.agent_configs to authenticated;

-- Sin las dos columnas cifradas: el panel solo necesita saber si hay conexión.
grant select (clinic_id, token_expires_at, scope, calendar_id, updated_at)
                                                    on public.google_credentials to authenticated;
grant delete                                        on public.google_credentials to authenticated;

grant select                                        on public.calls         to authenticated;
grant select                                        on public.appointments  to authenticated;
grant select                                        on public.transcripts   to authenticated;

-- =============================================================================
-- Políticas
--
-- Todas siguen el mismo patrón:
--   * `to authenticated` explícito. Nunca por sí solo: `TO authenticated` sin
--     predicado de pertenencia es autenticación sin autorización (BOLA/IDOR),
--     y además los inicios de sesión anónimos también reciben ese rol.
--   * La llamada a la función va envuelta en (select ...) para evaluarse una
--     sola vez por consulta en lugar de una vez por fila.
--   * Todo UPDATE lleva USING y WITH CHECK. Sin WITH CHECK, una clínica podría
--     reasignar sus propias filas a otra clínica.
-- =============================================================================

alter table public.clinics            enable row level security;
alter table public.profiles           enable row level security;
alter table public.agent_configs      enable row level security;
alter table public.google_credentials enable row level security;
alter table public.calls              enable row level security;
alter table public.appointments       enable row level security;
alter table public.transcripts        enable row level security;

-- --- clinics -----------------------------------------------------------------
-- Sin políticas de INSERT ni DELETE: las clínicas solo nacen del trigger de alta.
create policy clinics_select_own on public.clinics
  for select to authenticated
  using (id = (select private.current_clinic_id()));

create policy clinics_update_own on public.clinics
  for update to authenticated
  using (id = (select private.current_clinic_id()))
  with check (id = (select private.current_clinic_id()));

-- --- profiles ----------------------------------------------------------------
create policy profiles_select_clinic on public.profiles
  for select to authenticated
  using (clinic_id = (select private.current_clinic_id()));

-- Solo el propio perfil, y el WITH CHECK impide moverse a otra clínica.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and clinic_id = (select private.current_clinic_id())
  );

-- --- agent_configs -----------------------------------------------------------
create policy agent_configs_select_own on public.agent_configs
  for select to authenticated
  using (clinic_id = (select private.current_clinic_id()));

create policy agent_configs_update_own on public.agent_configs
  for update to authenticated
  using (clinic_id = (select private.current_clinic_id()))
  with check (clinic_id = (select private.current_clinic_id()));

-- --- google_credentials ------------------------------------------------------
-- Las escrituras las hace el callback de OAuth con service_role; el panel solo
-- consulta el estado y puede desconectar.
create policy google_credentials_select_own on public.google_credentials
  for select to authenticated
  using (clinic_id = (select private.current_clinic_id()));

create policy google_credentials_delete_own on public.google_credentials
  for delete to authenticated
  using (clinic_id = (select private.current_clinic_id()));

-- --- calls -------------------------------------------------------------------
-- Solo lectura: las llamadas las escribe el webhook de Vapi.
create policy calls_select_own on public.calls
  for select to authenticated
  using (clinic_id = (select private.current_clinic_id()));

-- --- appointments ------------------------------------------------------------
create policy appointments_select_own on public.appointments
  for select to authenticated
  using (clinic_id = (select private.current_clinic_id()));

-- --- transcripts -------------------------------------------------------------
create policy transcripts_select_own on public.transcripts
  for select to authenticated
  using (clinic_id = (select private.current_clinic_id()));
