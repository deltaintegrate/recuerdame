# Landing de Recuérdame

Página estática (HTML + CSS, sin build) para el SaaS de Recuérdame dirigido a mayoristas y almacenes de ropa.

## Antes de publicar
- En `index.html`, cambia `const WHATSAPP = "57XXXXXXXXXX"` por el número de ventas.
- Los precios de los planes son de referencia: ajústalos.

## Ver en local
Abre `index.html` en el navegador, o `npx serve landing`.

## Publicar en Cloudflare Pages
1. Workers & Pages → Create → Pages → Connect to Git → este repo.
2. Build command: vacío. Output directory: `landing`.
3. Custom domains → agrega tu dominio.
