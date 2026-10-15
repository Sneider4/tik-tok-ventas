# OMS Live Commerce

Sistema de gestión de pedidos para ventas por TikTok Live: checkout móvil, aprobación de
comprobantes, inventario sin sobreventa y generación masiva de guías.

- Arquitectura, ERD y estrategia de concurrencia: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- Backend: [backend/](backend/) — NestJS 11 + Prisma 6 + PostgreSQL
- Frontend: [frontend/](frontend/) — Angular 22 (standalone, signals, zoneless): checkout móvil (`/live/...`) y panel de administración (`/admin`).

## Arranque local

Requisitos: Node 20+ y Docker (para PostgreSQL).

```bash
docker compose up -d
```

```bash
cd backend && cp .env.example .env && npm install
```

```bash
npx prisma migrate deploy && npx prisma db seed
```

```bash
npm run start:dev
```

En otra terminal, el checkout:

```bash
cd frontend && npm install && npm start
```

Abre `http://localhost:4200/live/live-demo`. El dev server redirige `/api` y `/socket.io` a la API
(`frontend/proxy.conf.json`). En producción, sirve ambos bajo el mismo dominio (o configura CORS).

### Rutas del checkout

| Ruta | Pantalla |
|---|---|
| `/live/:slug` | Productos del Live con stock en vivo y carrito (se guarda en el celular) |
| `/live/:slug/datos` | Datos de quien recibe, dirección DANE y autorización de datos |
| `/pedido/:token` | Pago (Nequi/Daviplata/transferencia), subida de comprobante y seguimiento |
| `/` | Pedidos hechos desde este celular |

### Panel de administración (`/admin`)

Entra con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Se actualiza en tiempo real por WebSocket.

| Ruta | Pantalla |
|---|---|
| `/admin` | KPIs del día y pedidos por estado |
| `/admin/pagos` | Cola de comprobantes: ver captura/PDF, aprobar o rechazar con motivo |
| `/admin/pedidos` | Pedidos por estado, búsqueda, detalle (WhatsApp, cancelar) y acciones masivas: generar guías, marcar despachados/entregados |
| `/admin/inventario` | Físico / reservado / disponible en vivo, entradas de mercancía, ajustes y kardex |
| `/admin/guias` | Lotes de guías, progreso, reintento de fallidas y PDF único para la impresora térmica |
| `/admin/lives` | Lives: crear (link automático), iniciar / finalizar, copiar link, productos con precio Live, máximo por pedido, orden y visibilidad |
| `/admin/productos` | Catálogo: crear productos con varias variantes (SKU sugerido, stock inicial) y editar precio, peso, imagen y estado |

La API queda en `http://localhost:3000/api`. El seed crea el admin (`SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`), los departamentos y capitales DANE, productos de ejemplo y el Live
`live-demo` en estado `LIVE`.

> La base de datos debe estar en **UTF-8** (la imagen de Docker ya lo está). Un PostgreSQL
> instalado en Windows con codificación WIN1252 rechaza nombres con emojis, muy comunes en TikTok.

### Probar la concurrencia

Con la API corriendo:

```bash
npm run stress:reserve -- 200
```

Lanza 200 compras simultáneas contra una variante con 1 unidad disponible y verifica que
exactamente una gane (las demás reciben `409 OUT_OF_STOCK`).

## Endpoints principales

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/public/lives/:slug` | Catálogo del Live + stock + datos de pago |
| GET | `/api/public/locations/departments[/:code/cities]` | Selectores DANE |
| POST | `/api/public/lives/:slug/checkout` | Crear pedido y reservar stock |
| POST | `/api/public/orders/:token/payment` | Subir comprobante (multipart: `receipt`, `method`, `reference`) |
| GET | `/api/public/orders/:token` | Seguimiento del pedido |
| POST | `/api/auth/login` | Login admin (JWT) |
| GET | `/api/admin/dashboard/summary` | KPIs del día |
| GET | `/api/admin/orders?status=PAID,LABEL_GENERATED&search=` | Pedidos |
| POST | `/api/admin/orders/:id/cancel` | Cancelar (libera o devuelve stock) |
| POST | `/api/admin/orders/mark-shipped` | Marcar despachados en lote |
| GET | `/api/admin/payments?status=PENDING_REVIEW` | Cola de comprobantes |
| GET | `/api/admin/payments/:id/receipt` | Ver comprobante |
| POST | `/api/admin/payments/:id/approve` · `/reject` | Aprobar / rechazar |
| GET/POST | `/api/admin/products`, `/api/admin/variants/:id` | Catálogo |
| GET/POST | `/api/admin/inventory`, `/:variantId/adjust` | Inventario y kardex |
| GET/POST/PUT | `/api/admin/lives`, `/:id/status`, `/:id/items` | Lives |
| POST | `/api/admin/shipments/batches` | Generar guías en lote |
| GET | `/api/admin/shipments/batches/:id/labels.pdf` | PDF del lote para la térmica |

WebSocket (Socket.IO): namespace `/realtime`. Eventos `stock.updated` (público) y
`order.created`, `order.updated`, `payment.submitted`, `batch.updated` (con
`auth: { token }` de admin).
