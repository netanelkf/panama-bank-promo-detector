# Panama Bank Promo Detector

Backend que monitorea páginas de bancos panameños en busca de promociones de
**"compra de saldo"** de tarjeta de crédito (cuando un banco ofrece pagar/trasladar
el saldo de tu tarjeta de otro banco a una tasa promocional) y notifica por
email/push a los usuarios suscritos, dirigiéndolos al banco y al enlace con
las instrucciones.

## Cómo funciona

1. Cada **banco** (`banks`) tiene una o más **fuentes monitoreadas**
   (`monitored_sources`): una URL de su sitio + una lista de palabras clave
   (ej. `"compra de saldo"`).
2. Un job programado (`node-cron`, configurable con `SCRAPE_CRON`) recorre
   las fuentes activas, descarga el HTML (`axios` + `cheerio`), normaliza el
   texto (sin acentos, minúsculas) y busca las palabras clave.
3. Si encuentra una coincidencia **nueva** (el contenido cambió respecto a la
   última vez que se detectó una promo en esa fuente), crea un registro en
   `promotions` y notifica a todos los usuarios con `subscribed = true` por
   email y/o push (Expo), incluyendo el fragmento detectado y el enlace
   oficial del banco con las instrucciones.
4. Los usuarios pueden consultar el historial de promos vía `GET /promotions`.

## Bancos incluidos en el seed inicial

Fuentes verificadas manualmente (agosto 2026) — pueden cambiar de URL o
estructura con el tiempo, ajustables vía la API de administración:

- Banco General — `bgeneral.com/personas/promociones/`
- BAC Credomatic — `baccredomatic.com/es-pa/personas/landing/compra-de-saldo`
- Banistmo — `banistmo.com/personas/promociones`
- Global Bank — `globalbank.com.pa/promociones`
- Banesco — `banesco.com.pa/promociones/quitate-un-peso-de-encima/`
- Caja de Ahorros — `cajadeahorros.com.pa/promocion/compramos-tu-saldo/`
- Multibank — `multibank.com.pa/es/personas/compra-de-saldo`

## Setup

```bash
npm install
cp .env.example .env   # completa DATABASE_URL, JWT_SECRET, SMTP_*
npm run migrate
npm run seed            # carga los bancos y fuentes iniciales
npm run dev
```

Para probar el scraper manualmente sin esperar el cron:

```bash
npm run scrape
```

## API

### Auth
- `POST /auth/register` `{ email, password, name }`
- `POST /auth/login` `{ email, password }`
- `GET /auth/me`
- `PATCH /auth/me` `{ name, expo_push_token, subscribed }` — `subscribed: false` para darse de baja de las notificaciones

### Bancos (lectura pública, escritura solo admin)
- `GET /banks`
- `POST /banks` (admin) `{ name, slug, website_url }`
- `PATCH /banks/:id` (admin)
- `DELETE /banks/:id` (admin)
- `GET /banks/:id/sources` (admin)
- `POST /banks/:id/sources` (admin) `{ url, keywords: [...], css_selector? }`
- `PATCH /banks/:bankId/sources/:sourceId` (admin)
- `DELETE /banks/:bankId/sources/:sourceId` (admin)

### Promociones
- `GET /promotions?limit=50` (requiere sesión) — historial de promos detectadas

### Admin
- `POST /admin/scrape/run` (admin) — dispara un scrape inmediato de todas las fuentes activas

Para crear el primer usuario admin: regístralo normalmente vía `/auth/register`
y luego actualiza su `role` a `'admin'` directamente en la base de datos.

## Notas

- El scraping depende de que los bancos no cambien radicalmente el HTML de
  sus páginas de promociones; si dejan de detectarse promos reales, revisa
  `css_selector` y `keywords` de la fuente correspondiente.
- Este es un aviso automático informativo — siempre hay que verificar tasas
  y condiciones finales directamente con el banco antes de aplicar.
