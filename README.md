# busqueda-diario-oficial

Sistema para cruzar expedientes de derechos de agua con las publicaciones del Diario Oficial de Chile y gestionar las publicaciones DGA (clasificación y descarga de PDFs por CVE).

**Instalación completa paso a paso: [docs/INSTALACION.md](docs/INSTALACION.md)**

## Inicio rápido (local)

```bash
corepack enable
pnpm install
cp .env.example .env.local      # completar DATABASE_URL y BLOB_READ_WRITE_TOKEN
# ejecutar scripts/001-schema-completo.sql y scripts/002-reglas-dga-iniciales.sql en la base
pnpm dev                        # http://localhost:3000
```

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_V7Z7cWEBjOYnAiAQaJ3knXdi208L)
