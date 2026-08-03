import 'server-only';

import { createAdminClient, type AdminClient } from '@/lib/supabase/admin';
import type { Tables, TablesInsert } from '@/lib/types/database';

/**
 * Acceso a datos del webhook de Vapi, acotado a una sola clínica.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 *
 * El webhook llega sin sesión de usuario: no hay `auth.uid()` sobre el que
 * puedan actuar las políticas RLS, así que usa la clave `service_role`, que
 * SALTA Row Level Security y ve los datos de todas las clínicas. En ese punto
 * el aislamiento entre inquilinos deja de estar garantizado por la base de datos
 * y pasa a depender de la aplicación: es el lugar donde una fuga de datos entre
 * clínicas sería posible.
 *
 * Por eso toda lectura y escritura del webhook pasa por aquí. La clase recibe el
 * `clinicId` una sola vez y lo inyecta en cada consulta; los manejadores de
 * herramientas nunca reciben el cliente admin crudo, de modo que no pueden
 * escribir una consulta sin filtro aunque se descuiden.
 */
export class ClinicStore {
  private constructor(
    private readonly admin: AdminClient,
    readonly clinicId: string
  ) {}

  static forClinic(clinicId: string): ClinicStore {
    return new ClinicStore(createAdminClient(), clinicId);
  }

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------

  async getClinic(): Promise<Tables<'clinics'> | null> {
    const { data } = await this.admin
      .from('clinics')
      .select('*')
      .eq('id', this.clinicId)
      .maybeSingle();
    return data;
  }

  async getAgentConfig(): Promise<Tables<'agent_configs'> | null> {
    const { data } = await this.admin
      .from('agent_configs')
      .select('*')
      .eq('clinic_id', this.clinicId)
      .maybeSingle();
    return data;
  }

  /**
   * Guarda los identificadores que devuelve Vapi al publicar.
   *
   * El rol `authenticated` tiene revocado el UPDATE sobre estas columnas: son
   * la clave por la que el webhook decide a qué clínica pertenece una llamada,
   * así que solo las escribe el servidor tras confirmar la publicación.
   */
  async saveVapiIdentifiers(input: {
    assistantId: string;
    phoneNumberId?: string | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      vapi_assistant_id: input.assistantId,
      last_published_at: new Date().toISOString(),
    };

    if (input.phoneNumberId !== undefined) {
      patch.vapi_phone_number_id = input.phoneNumberId;
    }

    const { error } = await this.admin
      .from('agent_configs')
      .update(patch as never)
      .eq('clinic_id', this.clinicId);

    if (error) {
      throw new Error(`No se pudo guardar la referencia del asistente: ${error.message}`);
    }
  }

  /**
   * Asocia (o desasocia) el número de Vapi de la clínica.
   *
   * Va por aquí y no por el cliente de usuario porque `authenticated` tiene
   * revocado el UPDATE sobre esta columna: es la clave por la que el webhook
   * atribuye una llamada, y el índice único impide que dos clínicas reclamen el
   * mismo número.
   */
  async setVapiPhoneNumberId(phoneNumberId: string | null): Promise<void> {
    const { error } = await this.admin
      .from('agent_configs')
      .update({ vapi_phone_number_id: phoneNumberId })
      .eq('clinic_id', this.clinicId);

    if (error) {
      if (error.code === '23505') {
        throw new Error('Ese número ya está asignado a otra clínica.');
      }
      throw new Error(`No se pudo guardar el número: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Llamadas y transcripciones
  // ---------------------------------------------------------------------------

  async findCallByVapiId(vapiCallId: string): Promise<Tables<'calls'> | null> {
    const { data } = await this.admin
      .from('calls')
      .select('*')
      .eq('clinic_id', this.clinicId)
      .eq('vapi_call_id', vapiCallId)
      .maybeSingle();
    return data;
  }

  /**
   * Inserta o actualiza la llamada por su `vapi_call_id`, que es único.
   *
   * Vapi puede reenviar el mismo `end-of-call-report` si nuestra respuesta se
   * pierde, así que la operación tiene que ser idempotente.
   */
  async upsertCall(
    input: Omit<TablesInsert<'calls'>, 'clinic_id'>
  ): Promise<Tables<'calls'> | null> {
    const { data, error } = await this.admin
      .from('calls')
      .upsert({ ...input, clinic_id: this.clinicId }, { onConflict: 'vapi_call_id' })
      .select()
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo guardar la llamada: ${error.message}`);
    }
    return data;
  }

  /**
   * Reemplaza los turnos de una llamada.
   *
   * Se borran los previos para que un reenvío del informe no duplique la
   * conversación entera en la vista de transcripciones.
   */
  async replaceTranscripts(
    callId: string,
    turns: Omit<TablesInsert<'transcripts'>, 'clinic_id' | 'call_id'>[]
  ): Promise<void> {
    await this.admin
      .from('transcripts')
      .delete()
      .eq('clinic_id', this.clinicId)
      .eq('call_id', callId);

    if (turns.length === 0) return;

    const { error } = await this.admin.from('transcripts').insert(
      turns.map((turn) => ({
        ...turn,
        clinic_id: this.clinicId,
        call_id: callId,
      }))
    );

    if (error) {
      throw new Error(`No se pudieron guardar las transcripciones: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Citas
  // ---------------------------------------------------------------------------

  /** Citas activas que se solapan con un rango. */
  async findOverlappingAppointments(
    start: Date,
    end: Date
  ): Promise<Tables<'appointments'>[]> {
    const { data } = await this.admin
      .from('appointments')
      .select('*')
      .eq('clinic_id', this.clinicId)
      .eq('status', 'scheduled')
      // Dos rangos se solapan si cada uno empieza antes de que acabe el otro.
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString());

    return data ?? [];
  }

  /**
   * Crea la cita. Devuelve `null` si el hueco ya estaba ocupado.
   *
   * El índice único parcial `appointments_no_double_booking` es la red de
   * seguridad frente a dos llamadas simultáneas pidiendo la misma hora: la
   * comprobación previa de disponibilidad puede quedar obsoleta entre que se
   * consulta y se inserta.
   */
  async insertAppointment(
    input: Omit<TablesInsert<'appointments'>, 'clinic_id'>
  ): Promise<Tables<'appointments'> | null> {
    const { data, error } = await this.admin
      .from('appointments')
      .insert({ ...input, clinic_id: this.clinicId })
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation: el hueco se ocupó mientras tanto.
      if (error.code === '23505') return null;
      throw new Error(`No se pudo guardar la cita: ${error.message}`);
    }

    return data;
  }

  /** Enlaza la cita con su evento de Google una vez creado. */
  async setAppointmentGoogleEvent(
    appointmentId: string,
    googleEventId: string
  ): Promise<void> {
    await this.admin
      .from('appointments')
      .update({ google_event_id: googleEventId })
      .eq('clinic_id', this.clinicId)
      .eq('id', appointmentId);
  }

  /** Descarta una cita cuya creación no llegó a completarse. */
  async deleteAppointment(appointmentId: string): Promise<void> {
    await this.admin
      .from('appointments')
      .delete()
      .eq('clinic_id', this.clinicId)
      .eq('id', appointmentId);
  }

  /** Cita activa más próxima de un paciente, buscando por nombre aproximado. */
  async findScheduledAppointmentByPatient(
    patientName: string,
    from: Date
  ): Promise<Tables<'appointments'> | null> {
    const { data } = await this.admin
      .from('appointments')
      .select('*')
      .eq('clinic_id', this.clinicId)
      .eq('status', 'scheduled')
      .gte('start_time', from.toISOString())
      .ilike('patient_name', `%${patientName}%`)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    return data;
  }

  async findAppointmentByGoogleEventId(
    googleEventId: string
  ): Promise<Tables<'appointments'> | null> {
    const { data } = await this.admin
      .from('appointments')
      .select('*')
      .eq('clinic_id', this.clinicId)
      .eq('google_event_id', googleEventId)
      .maybeSingle();

    return data;
  }

  async markAppointmentCancelled(appointmentId: string): Promise<void> {
    const { error } = await this.admin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('clinic_id', this.clinicId)
      .eq('id', appointmentId);

    if (error) {
      throw new Error(`No se pudo cancelar la cita: ${error.message}`);
    }
  }

  /** Asocia a una llamada las citas creadas durante ella. */
  async attachAppointmentsToCall(
    appointmentIds: string[],
    callId: string
  ): Promise<void> {
    if (appointmentIds.length === 0) return;

    await this.admin
      .from('appointments')
      .update({ call_id: callId })
      .eq('clinic_id', this.clinicId)
      .in('id', appointmentIds);
  }
}

export interface ResolvedClinic {
  clinicId: string;
  timezone: string;
  name: string;
}

/**
 * Averigua a qué clínica pertenece una llamada entrante.
 *
 * Es la ÚNICA consulta legítima sin filtro por clínica de todo el webhook, y por
 * eso vive aquí, a la vista. Se prefiere `phoneNumberId` porque es el dato que
 * Vapi incluye siempre en las llamadas telefónicas; `assistantId` cubre las
 * llamadas web y los casos en los que el número aún no está asignado.
 *
 * Ambas columnas tienen un índice único parcial, así que dos clínicas no pueden
 * reclamar el mismo identificador.
 */
export async function resolveClinicFromCall(params: {
  phoneNumberId?: string | null;
  assistantId?: string | null;
}): Promise<ResolvedClinic | null> {
  const admin = createAdminClient();

  // Dos consultas en lugar de un join anidado: los tipos de este proyecto se
  // mantienen a mano y no declaran metadatos de relación, sin los cuales
  // supabase-js no puede inferir el tipo del recurso embebido.
  const lookup = async (
    column: 'vapi_phone_number_id' | 'vapi_assistant_id',
    value: string
  ): Promise<string | null> => {
    const { data } = await admin
      .from('agent_configs')
      .select('clinic_id')
      .eq(column, value)
      .maybeSingle();
    return data?.clinic_id ?? null;
  };

  const clinicId =
    (params.phoneNumberId
      ? await lookup('vapi_phone_number_id', params.phoneNumberId)
      : null) ??
    (params.assistantId ? await lookup('vapi_assistant_id', params.assistantId) : null);

  if (!clinicId) return null;

  const { data: clinic } = await admin
    .from('clinics')
    .select('id, name, timezone')
    .eq('id', clinicId)
    .maybeSingle();

  if (!clinic) return null;

  return {
    clinicId: clinic.id,
    name: clinic.name,
    timezone: clinic.timezone,
  };
}
