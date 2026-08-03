'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import {
  SPANISH_VOICES,
  TRANSCRIBER_PRESETS,
  businessHoursSchema,
  clinicInfoSchema,
  servicesSchema,
} from '@/lib/types/domain';
import { publishAssistant } from '@/lib/vapi/sync';

export interface ConfigState {
  error: string | null;
  notice: string | null;
}

/** Los campos compuestos viajan como JSON en inputs ocultos del formulario. */
function parseJsonField<T>(
  formData: FormData,
  name: string,
  schema: z.ZodType<T>
): T | { error: string } {
  const raw = String(formData.get(name) ?? '');

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: `No se pudo leer el campo ${name}.` };
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${name}: ${first.message}` : `El campo ${name} no es válido.` };
  }

  return parsed.data;
}

function isError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function saveConfiguration(
  _previous: ConfigState,
  formData: FormData
): Promise<ConfigState> {
  const session = await requireSession();

  const services = parseJsonField(formData, 'services', servicesSchema);
  if (isError(services)) return { error: services.error, notice: null };

  const businessHours = parseJsonField(formData, 'businessHours', businessHoursSchema);
  if (isError(businessHours)) return { error: businessHours.error, notice: null };

  const clinicInfo = parseJsonField(formData, 'clinicInfo', clinicInfoSchema);
  if (isError(clinicInfo)) return { error: clinicInfo.error, notice: null };

  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();
  if (systemPrompt.length < 20) {
    return {
      error: 'Las instrucciones del agente son demasiado cortas para guiar una llamada.',
      notice: null,
    };
  }

  const voiceId = String(formData.get('voiceId') ?? '');
  const voice = SPANISH_VOICES.find((option) => option.id === voiceId);
  if (!voice) return { error: 'Elige una de las voces disponibles.', notice: null };

  const transcriberId = String(formData.get('transcriberId') ?? '');
  const transcriber = TRANSCRIBER_PRESETS.find((option) => option.id === transcriberId);
  if (!transcriber) {
    return { error: 'Elige uno de los modos de transcripción disponibles.', notice: null };
  }

  const { error } = await session.supabase
    .from('agent_configs')
    .update({
      system_prompt: systemPrompt,
      tone: String(formData.get('tone') ?? '').trim() || 'profesional y cálido',
      first_message: String(formData.get('firstMessage') ?? '').trim(),
      handoff_message: String(formData.get('handoffMessage') ?? '').trim(),
      handoff_phone: String(formData.get('handoffPhone') ?? '').trim() || null,
      hipaa_enabled: formData.get('hipaaEnabled') === 'on',
      // El proveedor de voz es Azure porque Vapi lo ofrece integrado, sin exigir
      // conectar credenciales propias. Otros proveedores devuelven 400 al publicar
      // si no has dado de alta tu credencial en el panel de Vapi.
      voice: { provider: 'azure', voiceId: voice.id },
      transcriber: transcriber.config,
      language: transcriber.config.language,
      services,
      business_hours: businessHours,
      clinic_info: clinicInfo,
    })
    .eq('clinic_id', session.clinicId);

  if (error) {
    return { error: `No se pudo guardar: ${error.message}`, notice: null };
  }

  revalidatePath('/personalizacion');
  revalidatePath('/dashboard');

  return {
    error: null,
    notice: 'Cambios guardados. Publica para que el agente empiece a usarlos.',
  };
}

export interface PublishState {
  error: string | null;
  notice: string | null;
  warning: string | null;
}

export async function publishConfiguration(
  _previous: PublishState,
  _formData: FormData
): Promise<PublishState> {
  const session = await requireSession();

  const result = await publishAssistant(session.clinicId);

  if (!result.ok) {
    return { error: result.error, notice: null, warning: null };
  }

  revalidatePath('/personalizacion');
  revalidatePath('/integraciones');
  revalidatePath('/dashboard');

  return {
    error: null,
    notice: result.phoneNumberAssigned
      ? 'Publicado. El asistente está activo y el número apunta a él.'
      : 'Publicado.',
    warning: result.warning,
  };
}
