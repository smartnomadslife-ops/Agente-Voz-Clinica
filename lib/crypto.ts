/**
 * Cifrado simétrico AES-256-GCM para los secretos guardados en la base de datos
 * (hoy: los tokens de OAuth de Google).
 *
 * GCM es cifrado autenticado: además de ocultar el contenido, detecta cualquier
 * manipulación del texto cifrado. Un `authTag` alterado hace que el descifrado
 * falle en lugar de devolver basura.
 *
 * Este módulo es deliberadamente puro: recibe la clave como argumento en vez de
 * leerla del entorno. Así puede probarse con el runner de Node
 * (`pnpm test:crypto`) y la clave solo la manipulan los módulos `server-only`
 * que lo envuelven.
 *
 * Formato de salida: `v1:<iv>.<textoCifrado>.<authTag>`, todo en base64.
 * El prefijo de versión permite rotar el esquema más adelante sin ambigüedad.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, el tamaño recomendado para GCM
const KEY_BYTES = 32; // 256 bits
const TAG_BYTES = 16;

/**
 * Convierte la clave hexadecimal de configuración en bytes, verificando que
 * tenga exactamente el tamaño que exige AES-256.
 */
export function parseEncryptionKey(keyHex: string): Buffer {
  const normalized = keyHex.trim();

  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length !== KEY_BYTES * 2) {
    throw new Error(
      `La clave de cifrado debe ser ${KEY_BYTES * 2} caracteres hexadecimales ` +
        `(${KEY_BYTES} bytes). Genera una con: ` +
        `node -e "console.log(require('crypto').randomBytes(${KEY_BYTES}).toString('hex'))"`
    );
  }

  return Buffer.from(normalized, 'hex');
}

/** Cifra una cadena UTF-8. Cada llamada usa un IV nuevo. */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = parseEncryptionKey(keyHex);
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    `${VERSION}:${iv.toString('base64')}`,
    ciphertext.toString('base64'),
    authTag.toString('base64'),
  ].join('.');
}

/**
 * Descifra un valor producido por `encrypt`.
 *
 * Lanza si el formato no es válido, si la clave no corresponde o si el contenido
 * fue manipulado. Quien llama debe tratar el fallo como «credencial inservible»
 * y pedir al usuario que vuelva a conectar la integración.
 */
export function decrypt(payload: string, keyHex: string): string {
  const key = parseEncryptionKey(keyHex);

  const separatorIndex = payload.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error('Texto cifrado con formato inválido: falta el prefijo de versión');
  }

  const version = payload.slice(0, separatorIndex);
  if (version !== VERSION) {
    throw new Error(`Versión de cifrado no soportada: "${version}"`);
  }

  const parts = payload.slice(separatorIndex + 1).split('.');
  if (parts.length !== 3) {
    throw new Error('Texto cifrado con formato inválido: se esperaban 3 segmentos');
  }

  // Se comprueba que existan, no que tengan contenido: cifrar la cadena vacía
  // produce legítimamente un segmento de texto cifrado vacío.
  const [ivB64, ciphertextB64, authTagB64] = parts;
  if (ivB64 === undefined || ciphertextB64 === undefined || authTagB64 === undefined) {
    throw new Error('Texto cifrado con formato inválido: se esperaban 3 segmentos');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  if (iv.length !== IV_BYTES) {
    throw new Error('Texto cifrado con formato inválido: tamaño de IV incorrecto');
  }
  if (authTag.length !== TAG_BYTES) {
    throw new Error('Texto cifrado con formato inválido: tamaño de authTag incorrecto');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Compara dos cadenas en tiempo constante.
 *
 * Una comparación normal con `===` se detiene en el primer byte distinto, lo que
 * filtra por temporización cuántos caracteres del prefijo son correctos y
 * permite reconstruir un secreto byte a byte. Se usa para validar el secreto del
 * webhook de Vapi.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  // timingSafeEqual exige longitudes iguales. Comparar la longitud por separado
  // no filtra nada útil: el tamaño del secreto no es la parte confidencial.
  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}
