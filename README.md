# Agente de voz para clínicas dentales

Plataforma SaaS multi-tenant donde cada clínica dental obtiene su propio agente
telefónico de IA. El agente atiende llamadas en español, responde dudas
frecuentes y agenda, consulta o cancela citas contra Google Calendar. El panel
web permite supervisar la operación y personalizar el agente sin tocar código.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase
(Postgres + Auth + RLS) · Vapi · Google Calendar · pnpm.

---

## Cómo funciona

```
Paciente ──llama──▶ Número de Vapi ──▶ Asistente de la clínica
                                            │
                                            │ tool-calls / end-of-call-report
                                            ▼
                              POST /api/vapi/webhook
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            Google Calendar            Supabase              Respuesta hablada
          (freebusy, events)      (citas, llamadas,      { results: [{ toolCallId,
                                    transcripciones)          result }] }
```

Cada clínica es un *tenant*: tiene su propio asistente (`vapi_assistant_id`), su
propio número (`vapi_phone_number_id`) y sus propias credenciales de Google. El
webhook identifica a qué clínica pertenece cada llamada por el identificador del
número que Vapi incluye en el evento.

### Herramientas del agente

| Herramienta | Qué hace |
|---|---|
| `checkAvailability` | Consulta `freebusy` respetando el horario y la duración del tratamiento; devuelve hasta 3 alternativas |
| `bookAppointment` | Crea el evento en Google Calendar y registra la cita. Idempotente |
| `cancelAppointment` | Cancela en Google y marca la cita como cancelada |
| `getClinicInfo` | Dirección, horario, formas de pago, políticas y preguntas frecuentes |
| `requestHumanHandoff` | Deja constancia de que hace falta una persona |

---

## Puesta en marcha

Requisitos: **Node.js ≥ 20.9** y **pnpm**. Cuentas en Supabase, Vapi y Google Cloud.

```bash
pnpm install

# macOS y Linux
cp .env.example .env.local

# Windows (PowerShell)
Copy-Item .env.example .env.local
```

Rellena después los valores siguiendo las secciones de abajo. El fichero debe
llamarse exactamente **`.env.local`**, con punto: Next.js no carga ningún otro
nombre y no avisa de ello — la aplicación simplemente arrancará diciendo que
faltan variables de entorno.

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings → API** copia a `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — **nunca** la expongas al navegador: salta RLS.
3. Aplica las migraciones **en orden**. Con la CLI:

   ```bash
   supabase link --project-ref <tu-ref>
   supabase db push
   ```

   O pega el contenido de estos tres archivos en el **SQL Editor**, uno detrás de otro:

   ```
   supabase/migrations/20260801000100_schema.sql        tablas e índices
   supabase/migrations/20260801000200_rls.sql           RLS y privilegios
   supabase/migrations/20260801000300_signup_trigger.sql  alta de clínica
   ```

4. Comprueba que no hay avisos de seguridad:

   ```bash
   supabase db advisors
   ```

Al registrarse un dueño, el trigger `handle_new_user` crea automáticamente su
clínica, su perfil con rol `owner` y una configuración de agente con
tratamientos y horarios típicos de clínica dental.

### 2. Google Cloud (Calendar)

1. En [Google Cloud Console](https://console.cloud.google.com), crea un proyecto
   y activa la **Google Calendar API**.
2. Configura la **pantalla de consentimiento de OAuth**. Mientras esté en modo
   *Testing*, añade como usuarios de prueba los correos de las clínicas.
3. En **Credentials → Create credentials → OAuth client ID → Web application**,
   añade como *Authorized redirect URI* exactamente el valor que pongas en
   `GOOGLE_REDIRECT_URI`:
   - Local: `http://localhost:3000/api/google/callback`
   - Producción: `https://tu-dominio.com/api/google/callback`
4. Copia `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` a `.env.local`.

Los permisos solicitados son `calendar.events` (crear y borrar citas) y
`calendar.readonly` (mostrar en la app lo que se cree a mano en Google).

### 3. Claves de la aplicación

Necesitas dos valores aleatorios de 32 bytes en hexadecimal. Genera cada uno con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Funciona igual en Windows, macOS y Linux, y `randomBytes` es criptográficamente
seguro. En macOS o Linux también sirve `openssl rand -hex 32`; **en Windows no**,
porque `openssl` no viene instalado. No uses `Get-Random` de PowerShell: no es
apto para material criptográfico.

- `VAPI_WEBHOOK_SECRET` — se envía a Vapi al publicar y vuelve en cada petición.
- `ENCRYPTION_KEY` — cifra los tokens de Google en la base de datos con
  AES-256-GCM. **Si la cambias, las clínicas tendrán que reconectar Google.**

### 4. Vapi

1. En [dashboard.vapi.ai](https://dashboard.vapi.ai) → **API Keys**, copia la
   clave **privada** a `VAPI_API_KEY`.
2. Compra o importa un número en **Phone Numbers** y copia su **UUID** (no el
   `+52…`).
3. Arranca la app, entra en **Integraciones** y pega ese UUID.
4. Ve a **Personalización** y pulsa **Publicar**. Eso, en una sola operación:
   - crea o actualiza el asistente de la clínica,
   - fija `server.url` a `{APP_URL}/api/vapi/webhook` y el secreto,
   - declara `serverMessages` con `tool-calls`, `end-of-call-report` y `status-update`,
   - y **asigna el número al asistente**, sin lo cual las llamadas entrantes
     caerían en el mensaje por defecto de Vapi.

No hay que crear nada a mano en el panel de Vapi: todo el asistente se compone
desde la configuración de la clínica.

---

## Desarrollo local

Vapi necesita alcanzar el webhook desde internet, así que hace falta un túnel.

```bash
# Terminal 1
pnpm dev

# Terminal 2 — expón el puerto de la aplicación
ngrok http 3000
```

Pon la URL pública de ngrok en `APP_URL` y en `GOOGLE_REDIRECT_URI`
(`https://xxxx.ngrok-free.app/api/google/callback`), añade esa misma URI en
Google Cloud, reinicia `pnpm dev` y vuelve a **Publicar**. `APP_URL` es lo que se
envía a Vapi como `server.url`.

Alternativa con la CLI de Vapi, que reenvía desde su escucha al puerto local:

```bash
ngrok http 4242
vapi listen --forward-to localhost:3000/api/vapi/webhook
```

### Comprobar el webhook sin llamar por teléfono

```bash
# Sin el secreto correcto debe responder 401
curl -i -X POST http://localhost:3000/api/vapi/webhook \
  -H 'Content-Type: application/json' \
  -d '{"message":{"type":"tool-calls"}}'

# Con el secreto correcto devuelve { "results": [...] }
curl -s -X POST http://localhost:3000/api/vapi/webhook \
  -H 'Content-Type: application/json' \
  -H "x-vapi-secret: $VAPI_WEBHOOK_SECRET" \
  -d '{
    "message": {
      "type": "tool-calls",
      "call": { "id": "prueba-1", "phoneNumberId": "<UUID-del-numero>" },
      "toolCallList": [{
        "id": "tc-1",
        "name": "getClinicInfo",
        "parameters": {}
      }]
    }
  }'
```

---

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Añade todas las variables de `.env.example` en **Settings → Environment
   Variables**. `APP_URL` debe ser el dominio de producción, sin barra final.
3. Añade `https://tu-dominio.com/api/google/callback` como redirect URI en Google
   Cloud. Si vas a usar los *Preview Deployments*, añade también sus URLs.
4. Tras el despliegue, entra en **Personalización** y pulsa **Publicar** para que
   el asistente apunte al `server.url` de producción.

El webhook declara `maxDuration = 60`, suficiente para consultar Google y
escribir en Supabase dentro de una llamada.

---

## Verificación

```bash
pnpm exec tsc --noEmit   # tipos
pnpm lint                # ESLint
pnpm test                # cifrado y cálculo de huecos (20 pruebas)
pnpm build               # compilación de producción
```

**Aislamiento entre clínicas.** Registra dos clínicas con correos distintos, crea
datos en una y entra con la otra: ninguna vista debe mostrar nada de la primera.
Es la garantía que dan las políticas RLS.

**Prueba de extremo a extremo.** Regístrate → conecta Google Calendar → publica →
llama al número → pide una cita hablando. Al colgar deberías ver el evento en
Google Calendar, la cita en **Calendario** y la conversación en
**Transcripciones**. Crea después un evento a mano en Google Calendar y
comprueba que aparece en el calendario de la aplicación.

---

## Seguridad

- **Row Level Security** en todas las tablas, con políticas por `clinic_id`
  resueltas por `private.current_clinic_id()`. La función vive en un esquema
  privado y no en `public`, donde habría sido invocable por cualquiera.
- **Privilegios de columna**: un `staff` no puede ascenderse a `owner`, y los
  identificadores de Vapi —por los que el webhook atribuye cada llamada— solo los
  escribe el servidor.
- **El webhook usa `service_role`, que salta RLS.** Por eso todo su acceso a
  datos pasa por `lib/tenant/scoped-admin.ts`, que inyecta el `clinic_id` en cada
  consulta.
- **Tokens de Google cifrados** con AES-256-GCM antes de guardarlos, y con el
  `SELECT` de esas columnas revocado para el rol `authenticated`.
- **OAuth con protección CSRF**: el `state` lleva un nonce que se compara contra
  una cookie `httpOnly`.
- **Cada Server Action revalida la sesión.** `proxy.ts` es una capa de
  conveniencia: la documentación de Next.js 16 advierte de que las Server
  Functions viajan como POST sobre la ruta donde se declaran y un cambio de
  `matcher` podría dejarlas sin cobertura sin previo aviso.

### Sobre la autenticación del webhook

Vapi ofrece HMAC únicamente a través de *Custom Credentials*, y en ese modo **el
nombre de la cabecera de firma lo eliges tú**: no existe un `x-vapi-signature`
fijo que se pueda dar por supuesto. La aplicación admite las dos vías:

1. **Secreto compartido** (por defecto): se publica como `server.secret` y Vapi
   lo devuelve en `x-vapi-secret`. Se compara en tiempo constante. No requiere
   configurar nada en el dashboard.
2. **HMAC-SHA256** sobre el cuerpo crudo: define `VAPI_WEBHOOK_HMAC_HEADER` y
   `VAPI_WEBHOOK_HMAC_SECRET` con los valores de tu Custom Credential.

Si ninguna valida, la petición se rechaza con 401.

---

## Notas de configuración

**Voz.** Las voces por defecto son de **Azure** (`es-MX-DaliaNeural` y otras),
que Vapi proporciona sin necesidad de conectar credenciales propias. Otros
proveedores exigen dar de alta tu credencial en Vapi o devuelven un 400 al
publicar.

**Transcripción.** Por defecto Deepgram `nova-2` con `language: "es"`, que tiene
soporte dedicado de español. Para pacientes que mezclen idiomas, en el panel
puedes elegir `nova-3` en modo multilingüe.

**Modo HIPAA.** Al activarlo, Vapi deja de almacenar grabaciones y
transcripciones: la vista de **Transcripciones** quedará vacía. Las citas se
siguen registrando con normalidad. El panel avisa de ello antes de guardar.

---

## Estructura

```
app/
  (auth)/            login y registro
  (app)/             dashboard, calendario, transcripciones,
                     personalización, integraciones
  api/vapi/webhook   Server URL de Vapi (excluido del proxy)
  api/google/        flujo OAuth
  api/agent/test     sandbox del prompt, sin herramientas
lib/
  supabase/          clientes de navegador, servidor y admin
  tenant/            acceso a datos acotado por clínica
  google/            OAuth, calendario y cálculo de huecos
  vapi/              composición del prompt, payload y publicación
  webhook/           autenticación, validación y manejadores
  crypto.ts          AES-256-GCM
supabase/migrations/ esquema, RLS y trigger de alta
scripts/             pruebas con el runner de Node
```
