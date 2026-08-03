/**
 * Composición del system prompt que se publica en Vapi.
 *
 * El dueño de la clínica edita en el panel solo las INSTRUCCIONES de conducta.
 * Los datos operativos —tratamientos, duraciones, horario, dirección, formas de
 * pago, preguntas frecuentes— se anexan aquí automáticamente desde
 * `agent_configs`, de modo que cambiar un horario en el formulario baste para
 * que el agente lo respete, sin tener que reescribir el prompt a mano.
 */

import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  type BusinessHours,
  type ClinicInfo,
  type Service,
} from '@/lib/types/domain';

export interface PromptInput {
  clinicName: string;
  timezone: string;
  tone: string;
  /** Instrucciones de conducta editables desde el panel. */
  systemPrompt: string;
  services: Service[];
  businessHours: BusinessHours;
  clinicInfo: ClinicInfo;
  handoffPhone: string | null;
}

function renderBusinessHours(hours: BusinessHours): string {
  return WEEKDAYS.map((day) => {
    const ranges = hours[day];
    const label = WEEKDAY_LABELS[day];

    if (ranges.length === 0) return `- ${label}: cerrado`;

    const text = ranges.map((range) => `${range.start}-${range.end}`).join(' y ');
    return `- ${label}: ${text}`;
  }).join('\n');
}

function renderServices(services: Service[]): string {
  if (services.length === 0) {
    return 'No hay tratamientos configurados. Si el paciente pregunta, dile que el personal se lo confirmará.';
  }

  return services
    .map((service) => {
      const description = service.description ? ` — ${service.description}` : '';
      return `- ${service.name} (${service.duration_minutes} minutos)${description}`;
    })
    .join('\n');
}

function renderClinicInfo(info: ClinicInfo): string {
  const lines: string[] = [];

  if (info.address) lines.push(`- Dirección: ${info.address}`);
  if (info.phone) lines.push(`- Teléfono: ${info.phone}`);
  if (info.payment_methods.length > 0) {
    lines.push(`- Formas de pago: ${info.payment_methods.join(', ')}`);
  }
  if (info.policies) lines.push(`- Políticas: ${info.policies}`);

  return lines.length > 0 ? lines.join('\n') : 'No hay datos adicionales configurados.';
}

function renderFaq(info: ClinicInfo): string | null {
  if (info.faq.length === 0) return null;

  return info.faq
    .map((item) => `P: ${item.question}\nR: ${item.answer}`)
    .join('\n\n');
}

export function composeSystemPrompt(input: PromptInput): string {
  const sections: string[] = [];

  sections.push(
    [
      `Eres el asistente virtual de ${input.clinicName}, una clínica dental.`,
      `Atiendes llamadas telefónicas en español con un tono ${input.tone}.`,
      `La clínica opera en la zona horaria ${input.timezone}.`,
    ].join(' ')
  );

  if (input.systemPrompt.trim()) {
    sections.push(input.systemPrompt.trim());
  }

  sections.push(
    [
      'CÓMO MANEJAR LAS FECHAS',
      '',
      'No calcules fechas de memoria ni supongas qué día es hoy.',
      'Cuando el paciente diga algo relativo ("mañana", "el martes que viene", "la semana próxima"),',
      'llama a checkAvailability SIN el parámetro datetime y con daysAhead.',
      'La herramienta te devolverá huecos concretos con dos campos: `iso`, que debes reutilizar',
      'tal cual al llamar a bookAppointment, y `local`, que es el que debes leer en voz alta.',
      'Nunca leas al paciente el valor `iso`.',
    ].join('\n')
  );

  sections.push(`TRATAMIENTOS Y DURACIONES\n\n${renderServices(input.services)}`);

  sections.push(
    [
      'HORARIO DE ATENCIÓN',
      '',
      renderBusinessHours(input.businessHours),
      '',
      'No ofrezcas ni aceptes citas fuera de este horario.',
    ].join('\n')
  );

  sections.push(`INFORMACIÓN DE LA CLÍNICA\n\n${renderClinicInfo(input.clinicInfo)}`);

  const faq = renderFaq(input.clinicInfo);
  if (faq) {
    sections.push(`PREGUNTAS FRECUENTES\n\n${faq}`);
  }

  if (input.handoffPhone) {
    sections.push(
      [
        'TRASPASO A UNA PERSONA',
        '',
        'Si el paciente describe una urgencia, pide hablar con alguien del equipo,',
        'o se muestra frustrado, usa la herramienta de transferencia para pasarle con recepción.',
        'Avísale antes de transferir.',
      ].join('\n')
    );
  } else {
    sections.push(
      [
        'TRASPASO A UNA PERSONA',
        '',
        'La clínica no tiene configurado un número de recepción para transferir llamadas.',
        'Si el paciente necesita hablar con una persona, llama a requestHumanHandoff,',
        'toma sus datos de contacto y dile que le devolverán la llamada.',
      ].join('\n')
    );
  }

  return sections.join('\n\n---\n\n');
}

/** Saludo por defecto si la clínica no ha personalizado el suyo. */
export function defaultFirstMessage(clinicName: string): string {
  return `Gracias por llamar a ${clinicName}. Soy el asistente virtual. ¿En qué puedo ayudarle?`;
}
