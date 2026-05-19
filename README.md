# Recuérdame — WhatsApp Appointment Bot

Monorepo en Node 22 para agendar citas vía WhatsApp usando la API de Meta.

## Servicios

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| `webhook` | 3000 | Recibe mensajes de WhatsApp y gestiona conversaciones |
| `scheduler` | — | Envía recordatorios automáticos |
| `postgres` | 5432 | Base de datos PostgreSQL |

## Configuración rápida

### 1. Clonar y configurar variables

```bash
cp .env.example .env
# Editar .env con tus credenciales de Meta
```

### 2. Variables requeridas en `.env`

```
WHATSAPP_TOKEN=          # Token de acceso de tu app de Meta
WHATSAPP_PHONE_NUMBER_ID= # ID del número de WhatsApp Business
WHATSAPP_VERIFY_TOKEN=   # Token personalizado para verificar el webhook (cualquier string secreto)
```

### 3. Levantar con Docker

```bash
npm run docker:up
```

### 4. Configurar el webhook en Meta

- URL del webhook: `https://tu-dominio.com/webhook`
- Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN`
- Campos a suscribir: `messages`

## Flujo de conversación

```
Usuario escribe → Check citas existentes → ¿Quiere agendar?
  → Tipo de cita → Fecha → Hora → Lugar → Confirmar → Guardar
```

Los recordatorios se envían:
- 2 días antes de la cita
- El mismo día de la cita
- 1 hora antes de la cita

## Estructura del monorepo

```
packages/
  shared/    # DB pool + cliente WhatsApp API
  webhook/   # Servidor Express + máquina de estados
  scheduler/ # Cron de recordatorios (cada 30 min)
```
