/**
 * Pruebas del cálculo de huecos. Ejecutar con: pnpm test:availability
 *
 * Cubren lo que más fácil se rompe: los cruces de zona horaria y los cambios de
 * horario de verano.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findFreeSlots,
  generateCandidateSlots,
  isSlotFree,
  overlaps,
  parseIsoInClinicTimeZone,
} from '../lib/google/availability.ts';

const MEXICO = 'America/Mexico_City';
const MADRID = 'Europe/Madrid';

const EMPTY_WEEK = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

/** Horario de un solo día para aislar cada caso. */
function hoursOn(day, ranges) {
  return { ...EMPTY_WEEK, [day]: ranges };
}

test('genera huecos alineados con la granularidad dentro del horario', () => {
  // Lunes 3 de agosto de 2026, de 09:00 a 11:00 hora de Ciudad de México.
  const slots = generateCandidateSlots({
    timeZone: MEXICO,
    businessHours: hoursOn('monday', [{ start: '09:00', end: '11:00' }]),
    durationMinutes: 30,
    from: new Date('2026-08-03T00:00:00Z'),
    to: new Date('2026-08-05T00:00:00Z'),
  });

  // 09:00, 09:30, 10:00 y 10:30 caben; 11:00 ya no.
  assert.equal(slots.length, 4);

  const localTimes = slots.map((slot) =>
    new Intl.DateTimeFormat('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: MEXICO,
    }).format(slot.start)
  );
  assert.deepEqual(localTimes, ['09:00', '09:30', '10:00', '10:30']);
});

test('una cita más larga reduce el número de huecos que caben', () => {
  const base = {
    timeZone: MEXICO,
    businessHours: hoursOn('monday', [{ start: '09:00', end: '11:00' }]),
    from: new Date('2026-08-03T00:00:00Z'),
    to: new Date('2026-08-05T00:00:00Z'),
  };

  // Con 90 minutos solo caben los inicios de 09:00 y 09:30.
  assert.equal(generateCandidateSlots({ ...base, durationMinutes: 90 }).length, 2);
  // Con 120 minutos solo cabe el de 09:00.
  assert.equal(generateCandidateSlots({ ...base, durationMinutes: 120 }).length, 1);
  // Con 150 minutos no cabe ninguno.
  assert.equal(generateCandidateSlots({ ...base, durationMinutes: 150 }).length, 0);
});

test('la hora de pared se mantiene al cruzar el cambio de horario de verano', () => {
  // En España el horario de verano termina el domingo 25 de octubre de 2026.
  // El horario "09:00" debe seguir siendo las nueve locales antes y después,
  // aunque el desfase con UTC pase de +02:00 a +01:00.
  const slots = generateCandidateSlots({
    timeZone: MADRID,
    businessHours: {
      ...EMPTY_WEEK,
      friday: [{ start: '09:00', end: '09:30' }],
      monday: [{ start: '09:00', end: '09:30' }],
    },
    durationMinutes: 30,
    from: new Date('2026-10-20T00:00:00Z'),
    to: new Date('2026-11-01T00:00:00Z'),
  });

  const asUtc = slots.map((slot) => slot.start.toISOString());

  // Viernes 23 de octubre, todavía en horario de verano: 09:00 local = 07:00 UTC.
  assert.ok(asUtc.includes('2026-10-23T07:00:00.000Z'), `esperaba 07:00Z, obtuve ${asUtc}`);
  // Lunes 26 de octubre, ya en horario de invierno: 09:00 local = 08:00 UTC.
  assert.ok(asUtc.includes('2026-10-26T08:00:00.000Z'), `esperaba 08:00Z, obtuve ${asUtc}`);
});

test('respeta varios tramos en el mismo día (pausa de mediodía)', () => {
  const slots = generateCandidateSlots({
    timeZone: MEXICO,
    businessHours: hoursOn('monday', [
      { start: '09:00', end: '10:00' },
      { start: '16:00', end: '17:00' },
    ]),
    durationMinutes: 60,
    from: new Date('2026-08-03T00:00:00Z'),
    to: new Date('2026-08-05T00:00:00Z'),
  });

  assert.equal(slots.length, 2);
});

test('un día sin horario no produce huecos', () => {
  const slots = generateCandidateSlots({
    timeZone: MEXICO,
    businessHours: EMPTY_WEEK,
    durationMinutes: 30,
    from: new Date('2026-08-03T00:00:00Z'),
    to: new Date('2026-08-10T00:00:00Z'),
  });

  assert.equal(slots.length, 0);
});

test('no se proponen huecos anteriores al inicio de la ventana', () => {
  // La ventana arranca a las 10:00 locales, así que 09:00 y 09:30 quedan fuera.
  const slots = generateCandidateSlots({
    timeZone: MEXICO,
    businessHours: hoursOn('monday', [{ start: '09:00', end: '12:00' }]),
    durationMinutes: 30,
    from: new Date('2026-08-03T16:00:00Z'), // 10:00 en Ciudad de México (UTC-6)
    to: new Date('2026-08-04T00:00:00Z'),
  });

  const first = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: MEXICO,
  }).format(slots[0].start);

  assert.equal(first, '10:00');
});

test('overlaps: tocarse por un extremo no es solaparse', () => {
  const a = { start: new Date('2026-08-03T09:00:00Z'), end: new Date('2026-08-03T10:00:00Z') };
  const contiguo = { start: new Date('2026-08-03T10:00:00Z'), end: new Date('2026-08-03T11:00:00Z') };
  const solapado = { start: new Date('2026-08-03T09:30:00Z'), end: new Date('2026-08-03T10:30:00Z') };

  assert.equal(overlaps(a, contiguo), false);
  assert.equal(overlaps(a, solapado), true);
  assert.equal(isSlotFree(a, [contiguo]), true);
  assert.equal(isSlotFree(a, [solapado]), false);
});

test('findFreeSlots descuenta lo que Google marca como ocupado', () => {
  const params = {
    timeZone: MEXICO,
    businessHours: hoursOn('monday', [{ start: '09:00', end: '11:00' }]),
    durationMinutes: 30,
    from: new Date('2026-08-03T00:00:00Z'),
    to: new Date('2026-08-05T00:00:00Z'),
  };

  const todos = generateCandidateSlots(params);
  // Se ocupa el segundo hueco (09:30).
  const busy = [{ start: todos[1].start, end: todos[1].end }];
  const libres = findFreeSlots({ ...params, busy });

  assert.equal(libres.length, todos.length - 1);
  assert.ok(!libres.some((slot) => slot.start.getTime() === todos[1].start.getTime()));
});

test('una fecha ISO sin zona se interpreta como hora local de la clínica', () => {
  const parsed = parseIsoInClinicTimeZone('2026-08-03T09:00:00', MEXICO);
  // 09:00 en Ciudad de México (UTC-6) son las 15:00 UTC.
  assert.equal(parsed.toISOString(), '2026-08-03T15:00:00.000Z');
});

test('una fecha ISO con zona explícita se respeta tal cual', () => {
  const parsed = parseIsoInClinicTimeZone('2026-08-03T09:00:00Z', MEXICO);
  assert.equal(parsed.toISOString(), '2026-08-03T09:00:00.000Z');
});

test('una fecha inválida devuelve null', () => {
  assert.equal(parseIsoInClinicTimeZone('mañana por la tarde', MEXICO), null);
});
