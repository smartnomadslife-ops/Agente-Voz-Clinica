/**
 * Pruebas de lib/crypto.ts. Ejecutar con: pnpm test:crypto
 *
 * Node 24 elimina los tipos de los .ts automáticamente, así que el módulo se
 * importa tal cual, sin compilar.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decrypt,
  encrypt,
  parseEncryptionKey,
  timingSafeEquals,
} from '../lib/crypto.ts';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

test('ida y vuelta: descifrar devuelve el texto original', () => {
  const original = 'ya29.a0AfB_token-de-google-con-acentos-áéíóú-ñ';
  assert.equal(decrypt(encrypt(original, KEY), KEY), original);
});

test('la cadena vacía sobrevive al ciclo', () => {
  assert.equal(decrypt(encrypt('', KEY), KEY), '');
});

test('dos cifrados del mismo texto son distintos (IV aleatorio)', () => {
  assert.notEqual(encrypt('mismo texto', KEY), encrypt('mismo texto', KEY));
});

test('una clave incorrecta no puede descifrar', () => {
  const payload = encrypt('secreto', KEY);
  assert.throws(() => decrypt(payload, OTHER_KEY));
});

test('un authTag manipulado hace fallar el descifrado', () => {
  const payload = encrypt('secreto', KEY);
  const [prefix, ciphertext, authTag] = payload.split('.');

  // Se altera un solo carácter del tag.
  const first = authTag.slice(0, 1) === 'A' ? 'B' : 'A';
  const tampered = [prefix, ciphertext, first + authTag.slice(1)].join('.');

  assert.throws(() => decrypt(tampered, KEY));
});

test('un texto cifrado manipulado hace fallar el descifrado', () => {
  const payload = encrypt('secreto muy largo para poder alterarlo', KEY);
  const [prefix, ciphertext, authTag] = payload.split('.');

  const first = ciphertext.slice(0, 1) === 'A' ? 'B' : 'A';
  const tampered = [prefix, first + ciphertext.slice(1), authTag].join('.');

  assert.throws(() => decrypt(tampered, KEY));
});

test('se rechazan los formatos inválidos', () => {
  assert.throws(() => decrypt('sin-prefijo-de-version', KEY));
  assert.throws(() => decrypt('v1:solo.dos', KEY));
  assert.throws(() => decrypt('v2:a.b.c', KEY), /no soportada/);
});

test('se rechazan las claves con tamaño o alfabeto incorrectos', () => {
  assert.throws(() => parseEncryptionKey('abc'), /64 caracteres/);
  assert.throws(() => parseEncryptionKey('z'.repeat(64)), /64 caracteres/);
  assert.doesNotThrow(() => parseEncryptionKey(KEY));
});

test('timingSafeEquals distingue igualdad de diferencia', () => {
  assert.equal(timingSafeEquals('secreto', 'secreto'), true);
  assert.equal(timingSafeEquals('secreto', 'secretO'), false);
  assert.equal(timingSafeEquals('corto', 'mucho mas largo'), false);
  assert.equal(timingSafeEquals('', ''), true);
});
