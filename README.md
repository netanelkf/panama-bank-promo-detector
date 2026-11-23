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
   las fuentes activas, descarga el HTML (`axios` + `cheerio`, con reintento),
   descarta `<script>`/`<style>`/etc., normaliza el texto (sin acentos,
   minúsculas) y busca las palabras clave.
3. La huella (`fingerprint`) se calcula **solo sobre los bloques alrededor de
   la palabra clave** (el bloque que la contiene + los 2 siguientes), no sobre
   toda la página. Así un banner rotativo, el año del footer o una promo
   distinta no disparan alertas, pero un cambio de tasa/plazo/vigencia sí.
4. Si la huella cambió, crea un registro en `promotions` (con tasas y plazos
   extraídos en `details`) y notifica a los usuarios con `subscribed = true`
   por email (pool SMTP, máx. 5 en paralelo) y push (Expo, en lotes; los
   tokens muertos se limpian solos).
5. Cada fuente guarda su estado (`last_status_code`, `last_error`,
   `consecutive_failures`) — consulta `GET /admin/sources/health` para ver
   qué URLs están bloqueadas o rotas.
6. Los usuarios pueden consultar el historial vía `GET /promotions`.

## Bancos incluidos en el seed inicial

Fuentes localizadas por búsqueda web (agosto 2026) — **no verificadas por
carga directa**, ver "Limitaciones conocidas" abajo. Pueden cambiar de URL o
estructura con el tiempo, ajustables vía la API de administración:

- Banco General — `bgeneral.com/personas/promociones/`
- BAC Credomatic — `baccredomatic.com/es-pa/personas/landing/compra-de-saldo`
- Banistmo — `banistmo.com/personas/promociones`
- Global Bank — `globalbank.com.pa/promociones`
- Banesco — `banesco.com.pa/promociones/quitate-un-peso-de-encima/`
- Caja de Ahorros — `cajadeahorros.com.pa/promocion/compramos-tu-saldo/`
- Multibank — `multibank.com.pa/es/personas/compra-de-saldo`
- Citibank Panamá — `citibank.com.pa/panama/bancaPersonal/tarjetasDeCredito/CompraSaldo.htm`
- MetroBank — `metrobanksa.com/compra-de-saldo-0-a-12-meses/`
- Mercantil Banco Panamá — `mercantilbanco.com.pa/personas/tarjetas/compra-de-saldo`
- Davivienda (antes Scotiabank Panamá — su banca de personas en Panamá pasó a
  la marca DAVIbank tras la adquisición) — `davibank.pa/es/banca-personal/productos-complementarios/compra-de-saldo.html`

## Setup

```bash
npm install
cp .env.example .env   # completa DATABASE_URL, JWT_SECRET, SMTP_*
npm run migrate
npm run seed            # carga/actualiza bancos y fuentes (idempotente, no borra historial)
npm run dev
npm test                # tests de extracción/detección
```

Para probar el scraper manualmente sin esperar el cron:

```bash
npm run scrape
```

## Interfaz web

El mismo servidor sirve una página web en `/` (HTML/CSS/JS plano en
`public/`, sin paso de build):

- **Inicio** (sin sesión): qué hace el servicio y bancos monitoreados.
- **Promociones** (con sesión): la detección más reciente de cada banco con
  tasa y plazo, interruptor para activar/desactivar alertas por email e
  historial filtrable por banco.
- **Admin** (`role = 'admin'`): estado de cada fuente (OK / error / 403),
  botón "Revisar ahora" y edición de URL, palabras clave, selector y estado.

Con `npm run dev` ábrela en http://localhost:3000.

## API

### Auth
- `POST /auth/register` `{ email, password, name }`
- `POST /auth/login` `{ email, password }`
- `GET /auth/me`
- `PATCH /auth/me` `{ name, expo_push_token, subscribed }` — `subscribed: false` para darse de baja de las notificaciones

`/auth/register` y `/auth/login` tienen rate limit (20 intentos / 15 min por IP).

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
- `GET /promotions?limit=50&bank=<slug>` (requiere sesión) — historial de promos detectadas
- `GET /promotions/latest` (requiere sesión) — la promo más reciente de cada banco

### Admin
- `POST /admin/scrape/run` (admin) — lanza un scrape en segundo plano (`202`; `409` si ya hay uno corriendo)
- `GET /admin/sources/health` (admin) — estado de cada fuente: último HTTP status, error, fallos consecutivos

Para crear el primer usuario admin: regístralo normalmente vía `/auth/register`
y luego actualiza su `role` a `'admin'` directamente en la base de datos.

## Limitaciones conocidas

- **Cron en Render free**: el cron corre dentro del proceso web. Un web
  service *free* de Render se duerme tras ~15 min sin tráfico, así que el
  cron **no se ejecuta** mientras duerme. Opciones: plan pagado para el web
  service, o un Render Cron Job / GitHub Actions programado que ejecute
  `npm run scrape` (y `RUN_CRON=false` en el web). Además, la Postgres free
  de Render expira a los 30 días.
- **Bloqueo de bots**: varios sitios de bancos panameños devuelven `403` a
  clientes automatizados (WAF/Cloudflare/Akamai). El scraper envía headers de
  navegador (`src/services/scraperService.js`), pero eso no
  garantiza pasar todos los filtros — si un banco sigue devolviendo `403` en
  producción, revísalo por separado (puede necesitar un navegador headless
  tipo Playwright, o quedar fuera del scraping automático y depender de
  revisión manual periódica vía la API de admin).
- Las URLs y fuentes del seed se localizaron por búsqueda web, no cargando
  cada página directamente — pueden estar desactualizadas o haber cambiado.
  Verifica cada una antes de depender de ellas en producción.
- El scraping depende de que los bancos no cambien radicalmente el HTML de
  sus páginas de promociones; si dejan de detectarse promos reales, revisa
  `css_selector` y `keywords` de la fuente correspondiente.
- Este es un aviso automático informativo — siempre hay que verificar tasas
  y condiciones finales directamente con el banco antes de aplicar.
