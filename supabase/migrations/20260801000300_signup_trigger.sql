-- =============================================================================
-- Alta de un dueño de clínica.
--
-- Al insertarse una fila en auth.users se crea de golpe su clínica, su perfil
-- con rol `owner` y una configuración de agente con valores por defecto de
-- clínica dental, de modo que el asistente sea usable desde el primer minuto.
--
-- El nombre de la clínica llega en raw_user_meta_data, que la app rellena desde
-- el formulario de registro (options.data en supabase.auth.signUp).
--
-- Si esta función falla, el INSERT en auth.users se revierte y el registro
-- devuelve error. Es el comportamiento deseado: es preferible un alta fallida a
-- un usuario huérfano sin clínica, que rompería todas las políticas RLS.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_name text;
  v_full_name   text;
  v_timezone    text;
  v_base_slug   text;
  v_slug        text;
  v_suffix      int := 1;
  v_clinic_id   uuid;
begin
  v_clinic_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'clinic_name'), ''),
    'Clínica Dental'
  );
  v_full_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  v_timezone := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'timezone'), ''),
    'America/Mexico_City'
  );

  -- Slug legible: se quitan los acentos ANTES de bajar a minúsculas, porque
  -- lower() depende de la intercalación de la base de datos y con la
  -- intercalación C no transformaría los caracteres no ASCII.
  v_base_slug := btrim(
    regexp_replace(
      lower(translate(
        v_clinic_name,
        'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
      )),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );

  if v_base_slug = '' then
    v_base_slug := 'clinica';
  end if;

  -- Se intenta insertar y se reacciona a la colisión en lugar de comprobar
  -- antes: dos registros simultáneos con el mismo nombre pasarían la
  -- comprobación previa y uno de los dos fallaría igualmente.
  v_slug := v_base_slug;
  for _ in 1..50 loop
    begin
      insert into public.clinics (name, slug, timezone)
      values (v_clinic_name, v_slug, v_timezone)
      returning id into v_clinic_id;
      exit;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
      v_slug := v_base_slug || '-' || v_suffix::text;
    end;
  end loop;

  if v_clinic_id is null then
    raise exception 'No se pudo generar un slug único para la clínica "%"', v_clinic_name;
  end if;

  insert into public.profiles (id, clinic_id, full_name, role)
  values (new.id, v_clinic_id, v_full_name, 'owner');

  insert into public.agent_configs (
    clinic_id,
    system_prompt,
    first_message,
    handoff_message,
    services,
    business_hours,
    clinic_info
  )
  values (
    v_clinic_id,
    $prompt$Eres el asistente virtual de una clínica dental. Atiendes llamadas telefónicas de pacientes en español.

Tu objetivo es resolver dudas frecuentes y agendar, consultar o cancelar citas.

CÓMO HABLAR
- Responde en una o dos frases. Es una conversación por teléfono, no un chat.
- Habla con naturalidad, sin listas, sin viñetas, sin emojis y sin markdown.
- Di las horas como se dicen en voz alta: "las cuatro y media de la tarde", no "16:30".
- Si no entiendes al paciente, pídele que lo repita en lugar de suponer.

PARA AGENDAR UNA CITA
1. Pregunta el motivo o el tratamiento. Si el paciente no sabe cuál necesita, ofrécele los disponibles.
2. Pregunta qué día y a qué hora le vendría bien.
3. Llama SIEMPRE a checkAvailability antes de prometer una hora. Nunca confirmes una cita sin haber comprobado que está libre.
4. Si esa hora no está disponible, ofrece las alternativas que devuelva la herramienta.
5. Pide nombre completo y número de teléfono. El correo es opcional: si lo facilita, recibirá la confirmación por email.
6. Pregunta si es la primera vez que acude a la clínica.
7. Repite en voz alta el tratamiento, el día, la hora y el nombre, y espera a que el paciente lo confirme.
8. Solo entonces llama a bookAppointment.
9. Confirma que la cita ha quedado agendada y despídete.

REGLAS
- No inventes horarios, precios, tratamientos ni datos de la clínica. Si no lo sabes, usa getClinicInfo o di que el personal lo confirmará.
- No des diagnósticos ni consejo médico. Si el paciente describe un problema de salud, dile que el dentista lo valorará en la consulta.
- Si se trata de una urgencia o el paciente pide hablar con una persona, llama a requestHumanHandoff.
- Respeta siempre el horario de atención: no ofrezcas huecos fuera de él.$prompt$,
    'Gracias por llamar a ' || v_clinic_name ||
      '. Soy el asistente virtual. ¿En qué puedo ayudarle?',
    'Le paso con recepción, un momento por favor.',
    $json$[
      {"name": "Revisión general", "duration_minutes": 30, "description": "Consulta de valoración y diagnóstico."},
      {"name": "Limpieza dental", "duration_minutes": 45, "description": "Higiene bucal y eliminación de sarro."},
      {"name": "Urgencia", "duration_minutes": 30, "description": "Dolor, flemón o rotura reciente."},
      {"name": "Ortodoncia", "duration_minutes": 60, "description": "Primera consulta o revisión de brackets y alineadores."},
      {"name": "Blanqueamiento", "duration_minutes": 60, "description": "Tratamiento estético de blanqueamiento dental."},
      {"name": "Endodoncia", "duration_minutes": 90, "description": "Tratamiento de conducto."},
      {"name": "Extracción", "duration_minutes": 45, "description": "Extracción de una pieza dental."},
      {"name": "Implante", "duration_minutes": 60, "description": "Consulta de valoración para implante dental."}
    ]$json$::jsonb,
    $json${
      "monday":    [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "20:00"}],
      "tuesday":   [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "20:00"}],
      "wednesday": [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "20:00"}],
      "thursday":  [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "20:00"}],
      "friday":    [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "19:00"}],
      "saturday":  [{"start": "09:00", "end": "14:00"}],
      "sunday":    []
    }$json$::jsonb,
    $json${
      "address": "",
      "phone": "",
      "payment_methods": ["Efectivo", "Tarjeta", "Transferencia"],
      "policies": "Le pedimos avisar con 24 horas de antelación para cancelar o cambiar una cita.",
      "faq": [
        {"question": "¿Atienden urgencias?", "answer": "Sí, reservamos huecos diarios para urgencias."},
        {"question": "¿Trabajan con seguros dentales?", "answer": "Indíquenos su seguro y le confirmamos la cobertura."}
      ]
    }$json$::jsonb
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea clínica + perfil owner + configuración por defecto al registrarse un usuario.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
