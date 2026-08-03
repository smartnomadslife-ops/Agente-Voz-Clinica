'use client';

import { Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  saveConfiguration,
  type ConfigState,
} from '@/app/(app)/personalizacion/actions';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, inputClasses } from '@/components/ui/field';
import { Note } from '@/components/ui/states';
import {
  SPANISH_VOICES,
  TRANSCRIBER_PRESETS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type BusinessHours,
  type ClinicInfo,
  type FaqItem,
  type Service,
  type Weekday,
} from '@/lib/types/domain';

export interface ConfigFormValues {
  systemPrompt: string;
  tone: string;
  firstMessage: string;
  handoffMessage: string;
  handoffPhone: string;
  hipaaEnabled: boolean;
  voiceId: string;
  transcriberId: string;
  services: Service[];
  businessHours: BusinessHours;
  clinicInfo: ClinicInfo;
}

const INITIAL: ConfigState = { error: null, notice: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  );
}

function SectionCard({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} eyebrow={eyebrow} />
      <CardBody className="space-y-4">
        {description ? <p className="text-sm text-ink-soft">{description}</p> : null}
        {children}
      </CardBody>
    </Card>
  );
}

export function ConfigForm({ initial }: { initial: ConfigFormValues }) {
  const [state, formAction] = useActionState(saveConfiguration, INITIAL);

  const [services, setServices] = useState<Service[]>(initial.services);
  const [hours, setHours] = useState<BusinessHours>(initial.businessHours);
  const [faq, setFaq] = useState<FaqItem[]>(initial.clinicInfo.faq);
  const [address, setAddress] = useState(initial.clinicInfo.address);
  const [phone, setPhone] = useState(initial.clinicInfo.phone);
  const [policies, setPolicies] = useState(initial.clinicInfo.policies);
  const [paymentMethods, setPaymentMethods] = useState(
    initial.clinicInfo.payment_methods.join(', ')
  );
  const [hipaa, setHipaa] = useState(initial.hipaaEnabled);

  const clinicInfo: ClinicInfo = {
    address,
    phone,
    policies,
    payment_methods: paymentMethods
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    faq,
  };

  const updateRange = (
    day: Weekday,
    index: number,
    key: 'start' | 'end',
    value: string
  ) => {
    setHours((current) => ({
      ...current,
      [day]: current[day].map((range, position) =>
        position === index ? { ...range, [key]: value } : range
      ),
    }));
  };

  return (
    <form action={formAction} className="space-y-6">
      {/* Los campos compuestos viajan como JSON: el estado vive en React y el
          servidor lo revalida con los mismos esquemas de zod. */}
      <input type="hidden" name="services" value={JSON.stringify(services)} />
      <input type="hidden" name="businessHours" value={JSON.stringify(hours)} />
      <input type="hidden" name="clinicInfo" value={JSON.stringify(clinicInfo)} />

      <SectionCard
        title="Cómo se comporta el agente"
        eyebrow="Instrucciones"
        description="Estas instrucciones guían la conversación. Los tratamientos, el horario y los datos de la clínica se añaden automáticamente al publicar, así que no hace falta repetirlos aquí."
      >
        <Field label="Saludo inicial" htmlFor="firstMessage">
          <input
            id="firstMessage"
            name="firstMessage"
            defaultValue={initial.firstMessage}
            maxLength={300}
            className={inputClasses}
          />
        </Field>

        <Field label="Tono" htmlFor="tone" hint="Por ejemplo: profesional y cálido, cercano, formal.">
          <input
            id="tone"
            name="tone"
            defaultValue={initial.tone}
            maxLength={80}
            className={inputClasses}
          />
        </Field>

        <Field label="Instrucciones" htmlFor="systemPrompt">
          <textarea
            id="systemPrompt"
            name="systemPrompt"
            defaultValue={initial.systemPrompt}
            rows={16}
            className={`${inputClasses} font-mono text-xs leading-relaxed`}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Voz e idioma"
        eyebrow="Cómo suena"
        description="Estas voces las proporciona Vapi directamente, sin que tengas que dar de alta credenciales de ningún proveedor."
      >
        <Field label="Voz" htmlFor="voiceId">
          <select
            id="voiceId"
            name="voiceId"
            defaultValue={initial.voiceId}
            className={inputClasses}
          >
            {SPANISH_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Reconocimiento de voz"
          htmlFor="transcriberId"
          hint="Elige el modo multilingüe solo si esperas pacientes que mezclen idiomas."
        >
          <select
            id="transcriberId"
            name="transcriberId"
            defaultValue={initial.transcriberId}
            className={inputClasses}
          >
            {TRANSCRIBER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>
      </SectionCard>

      <SectionCard
        title="Tratamientos"
        eyebrow="Qué se puede reservar"
        description="La duración determina cuánto hueco reserva el agente en la agenda para cada tipo de cita."
      >
        <div className="space-y-3">
          {services.map((service, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-md border border-line bg-paper p-3 sm:grid-cols-[1fr_7rem_auto]"
            >
              <input
                aria-label="Nombre del tratamiento"
                value={service.name}
                onChange={(event) =>
                  setServices((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, name: event.target.value } : item
                    )
                  )
                }
                placeholder="Limpieza dental"
                className={inputClasses}
              />
              <div className="flex items-center gap-2">
                <input
                  aria-label="Duración en minutos"
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={service.duration_minutes}
                  onChange={(event) =>
                    setServices((current) =>
                      current.map((item, position) =>
                        position === index
                          ? { ...item, duration_minutes: Number(event.target.value) }
                          : item
                      )
                    )
                  }
                  className={`${inputClasses} tabular`}
                />
                <span className="text-xs whitespace-nowrap text-ink-faint">min</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setServices((current) =>
                    current.filter((_, position) => position !== index)
                  )
                }
                aria-label={`Quitar ${service.name || 'tratamiento'}`}
                className="flex h-10 w-10 items-center justify-center rounded-md text-ink-faint hover:bg-alert-soft hover:text-alert"
              >
                <Trash size={16} />
              </button>

              <input
                aria-label="Descripción"
                value={service.description ?? ''}
                onChange={(event) =>
                  setServices((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, description: event.target.value }
                        : item
                    )
                  )
                }
                placeholder="Descripción breve (opcional)"
                className={`${inputClasses} sm:col-span-3`}
              />
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setServices((current) => [
              ...current,
              { name: '', duration_minutes: 30, description: '' },
            ])
          }
        >
          <Plus size={15} />
          Añadir tratamiento
        </Button>
      </SectionCard>

      <SectionCard
        title="Horario de atención"
        eyebrow="Cuándo se puede citar"
        description="El agente no ofrecerá ni aceptará citas fuera de estos tramos. Deja un día sin tramos para marcarlo como cerrado."
      >
        <div className="space-y-2.5">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="flex flex-wrap items-center gap-2 border-b border-line pb-2.5 last:border-0"
            >
              <span className="w-24 shrink-0 text-sm font-medium text-ink">
                {WEEKDAY_LABELS[day]}
              </span>

              {hours[day].length === 0 ? (
                <span className="text-sm text-ink-faint">Cerrado</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {hours[day].map((range, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <input
                        aria-label={`${WEEKDAY_LABELS[day]}, apertura`}
                        type="time"
                        value={range.start}
                        onChange={(event) =>
                          updateRange(day, index, 'start', event.target.value)
                        }
                        className="tabular h-9 rounded-md border border-line-strong bg-surface px-2 text-sm"
                      />
                      <span className="text-ink-faint">–</span>
                      <input
                        aria-label={`${WEEKDAY_LABELS[day]}, cierre`}
                        type="time"
                        value={range.end}
                        onChange={(event) =>
                          updateRange(day, index, 'end', event.target.value)
                        }
                        className="tabular h-9 rounded-md border border-line-strong bg-surface px-2 text-sm"
                      />
                      <button
                        type="button"
                        aria-label="Quitar tramo"
                        onClick={() =>
                          setHours((current) => ({
                            ...current,
                            [day]: current[day].filter(
                              (_, position) => position !== index
                            ),
                          }))
                        }
                        className="flex h-9 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-alert-soft hover:text-alert"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setHours((current) => ({
                    ...current,
                    [day]: [...current[day], { start: '09:00', end: '14:00' }],
                  }))
                }
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-agent hover:bg-agent-soft"
              >
                <Plus size={13} />
                Añadir tramo
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Información de la clínica"
        eyebrow="Para responder dudas"
        description="El agente usa estos datos para contestar preguntas frecuentes en lugar de improvisar."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dirección" htmlFor="address">
            <input
              id="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={inputClasses}
              placeholder="Av. Reforma 123, Ciudad de México"
            />
          </Field>

          <Field label="Teléfono de contacto" htmlFor="clinicPhone">
            <input
              id="clinicPhone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClasses}
              placeholder="+52 55 1234 5678"
            />
          </Field>
        </div>

        <Field
          label="Formas de pago"
          htmlFor="paymentMethods"
          hint="Sepáralas con comas."
        >
          <input
            id="paymentMethods"
            value={paymentMethods}
            onChange={(event) => setPaymentMethods(event.target.value)}
            className={inputClasses}
            placeholder="Efectivo, Tarjeta, Transferencia"
          />
        </Field>

        <Field label="Políticas" htmlFor="policies">
          <textarea
            id="policies"
            value={policies}
            onChange={(event) => setPolicies(event.target.value)}
            rows={3}
            className={inputClasses}
            placeholder="Avisar con 24 horas de antelación para cancelar o cambiar una cita."
          />
        </Field>

        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">Preguntas frecuentes</p>

          {faq.map((item, index) => (
            <div key={index} className="space-y-2 rounded-md border border-line bg-paper p-3">
              <div className="flex gap-2">
                <input
                  aria-label="Pregunta"
                  value={item.question}
                  onChange={(event) =>
                    setFaq((current) =>
                      current.map((entry, position) =>
                        position === index
                          ? { ...entry, question: event.target.value }
                          : entry
                      )
                    )
                  }
                  placeholder="¿Atienden urgencias?"
                  className={inputClasses}
                />
                <button
                  type="button"
                  aria-label="Quitar pregunta"
                  onClick={() =>
                    setFaq((current) => current.filter((_, position) => position !== index))
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-alert-soft hover:text-alert"
                >
                  <Trash size={16} />
                </button>
              </div>
              <textarea
                aria-label="Respuesta"
                value={item.answer}
                onChange={(event) =>
                  setFaq((current) =>
                    current.map((entry, position) =>
                      position === index ? { ...entry, answer: event.target.value } : entry
                    )
                  )
                }
                rows={2}
                placeholder="Sí, reservamos huecos diarios para urgencias."
                className={inputClasses}
              />
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setFaq((current) => [...current, { question: '', answer: '' }])}
          >
            <Plus size={15} />
            Añadir pregunta
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Traspaso a recepción"
        eyebrow="Cuando hace falta una persona"
        description="Si indicas un número, el agente podrá transferir la llamada. Sin él, solo tomará los datos y dejará constancia."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono de recepción" htmlFor="handoffPhone">
            <input
              id="handoffPhone"
              name="handoffPhone"
              defaultValue={initial.handoffPhone}
              placeholder="+52 55 1234 5678"
              className={`${inputClasses} tabular`}
            />
          </Field>

          <Field label="Qué dice al transferir" htmlFor="handoffMessage">
            <input
              id="handoffMessage"
              name="handoffMessage"
              defaultValue={initial.handoffMessage}
              maxLength={200}
              className={inputClasses}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Privacidad" eyebrow="Datos de salud">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="hipaaEnabled"
            checked={hipaa}
            onChange={(event) => setHipaa(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line-strong text-agent focus:ring-agent/30"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Activar modo HIPAA</span>
            <span className="block text-sm text-ink-soft">
              Vapi deja de almacenar grabaciones y transcripciones de las llamadas.
            </span>
          </span>
        </label>

        {hipaa ? (
          <Note tone="warn">
            <span className="flex items-start gap-2">
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                Con esta opción activada la pantalla de Transcripciones quedará vacía:
                no habrá conversaciones que mostrar porque Vapi no las guardará. Las
                citas sí se seguirán registrando.
              </span>
            </span>
          </Note>
        ) : null}
      </SectionCard>

      {state.error ? <Note tone="alert">{state.error}</Note> : null}
      {state.notice ? <Note tone="ok">{state.notice}</Note> : null}

      <div className="sticky bottom-4 flex justify-end">
        <div className="rounded-lg border border-line bg-surface/95 p-2 shadow-sm backdrop-blur">
          <SaveButton />
        </div>
      </div>
    </form>
  );
}
