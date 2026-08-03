import { notFound } from 'next/navigation';
import { ConfigForm, type ConfigFormValues } from '@/app/(app)/personalizacion/config-form';
import { PublishPanel, TestPanel } from '@/app/(app)/personalizacion/publish-panel';
import { requireSession } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/clinic-time';
import {
  EMPTY_BUSINESS_HOURS,
  EMPTY_CLINIC_INFO,
  SPANISH_VOICES,
  TRANSCRIBER_PRESETS,
  businessHoursSchema,
  clinicInfoSchema,
  parseJsonColumn,
  servicesSchema,
  transcriberSchema,
  voiceSchema,
} from '@/lib/types/domain';

export const metadata = { title: 'Personalización · Panel de clínica' };

export default async function CustomizationPage() {
  const session = await requireSession();

  const [{ data: clinic }, { data: config }] = await Promise.all([
    session.supabase
      .from('clinics')
      .select('name, timezone')
      .eq('id', session.clinicId)
      .maybeSingle(),
    session.supabase
      .from('agent_configs')
      .select('*')
      .eq('clinic_id', session.clinicId)
      .maybeSingle(),
  ]);

  // Sin configuración no hay nada que personalizar: solo ocurre si falló el
  // trigger de alta, en cuyo caso la clínica está a medio crear.
  if (!config) notFound();

  const timeZone = clinic?.timezone ?? 'America/Mexico_City';

  const voice = parseJsonColumn(voiceSchema, config.voice, {
    provider: 'azure',
    voiceId: 'es-MX-DaliaNeural',
  });

  const transcriber = parseJsonColumn(transcriberSchema, config.transcriber, {
    provider: 'deepgram',
    model: 'nova-2',
    language: 'es',
  });

  const matchedVoice =
    SPANISH_VOICES.find((option) => option.id === voice.voiceId) ?? SPANISH_VOICES[0];

  const matchedTranscriber =
    TRANSCRIBER_PRESETS.find(
      (preset) =>
        preset.config.model === transcriber.model &&
        preset.config.language === transcriber.language
    ) ?? TRANSCRIBER_PRESETS[0];

  const initial: ConfigFormValues = {
    systemPrompt: config.system_prompt,
    tone: config.tone,
    firstMessage: config.first_message,
    handoffMessage: config.handoff_message,
    handoffPhone: config.handoff_phone ?? '',
    hipaaEnabled: config.hipaa_enabled,
    voiceId: matchedVoice?.id ?? 'es-MX-DaliaNeural',
    transcriberId: matchedTranscriber?.id ?? 'nova-2-es',
    services: parseJsonColumn(servicesSchema, config.services, []),
    businessHours: parseJsonColumn(
      businessHoursSchema,
      config.business_hours,
      EMPTY_BUSINESS_HOURS
    ),
    clinicInfo: parseJsonColumn(clinicInfoSchema, config.clinic_info, EMPTY_CLINIC_INFO),
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1.5">Personalización</p>
        <h1 className="text-2xl">El agente de {clinic?.name ?? 'tu clínica'}</h1>
        {config.last_published_at ? (
          <p className="tabular mt-1 text-sm text-ink-soft">
            Publicado por última vez el{' '}
            {formatDateTime(new Date(config.last_published_at), timeZone)}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">Todavía sin publicar.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PublishPanel published={Boolean(config.vapi_assistant_id)} />
        <TestPanel />
      </div>

      <ConfigForm initial={initial} />
    </div>
  );
}
