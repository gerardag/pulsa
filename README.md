# Registre de tensió arterial

Aplicació autoallotjada per portar un **registre diari de la tensió arterial**
(sistòlica / màxima i diastòlica / mínima), amb diverses lectures per dia,
vista calendari i exportació a PDF, CSV i PDF calendari. Pensada per córrer al
teu servidor de casa amb Docker.

## Què fa

- Registra lectures de tensió amb **data, hora, sistòlica, diastòlica, pols i notes**.
- Permet **més d'una lectura per dia** (matí/vespre, etc.) indicant l'hora.
- Classifica cada lectura automàticament (Òptima, Normal, Hipertensió grau 1/2…)
  segons llindars habituals (ESC/ESH) i la pinta amb color.
- **Vista calendari** dins l'app per veure tot un mes d'una ullada.
- **Resum estadístic**: mitjana sist./diast., pols mitjà, màxim i mínim del període.
- **Exportació** seleccionant format i rang de dies:
  - **CSV** (per obrir amb Excel / full de càlcul, amb BOM UTF-8).
  - **PDF llista** detallada amb resum i taula.
  - **PDF calendari**: una graella mensual per cada mes del rang.
  - **JSON** (còpia de seguretat, per importar posteriorment).
- **Importació** de fitxers JSON per restaurar còpies de seguretat.
- Persisteix tot en una base de dades **SQLite** dins un volum Docker.

## Requisits

- Docker i Docker Compose al servidor.
- Res més: SQLite és el mòdul integrat `node:sqlite` de Node 22. Les úniques
  dependències externes són **Express** (servidor) i **pdfkit** (generació de PDF,
  JS pur, sense binaris natius).

## Desplegament

```bash
git clone <la-url-del-teu-repo> tensio
cd tensio
docker compose up -d --build
```

Obre `http://<ip-del-servidor>:3000` des de qualsevol dispositiu de la xarxa local.

Per canviar el port, edita el costat esquerre del mapatge a `docker-compose.yml`
(per defecte `3000:3000`).

### Comandes útils

```bash
docker compose logs -f        # veure logs
docker compose down           # aturar (les dades es conserven al volum)
docker compose up -d --build  # reconstruir després de canvis
```

## On viuen les dades

A la base de dades SQLite dins la carpeta `./data` del projecte, muntada a
`/app/data` dins del contenidor (bind mount). Sobreviu a reinicis i reconstruccions
de la imatge. `docker compose down` **no** toca la carpeta; per esborrar l'històric,
esborra `./data`.

### Còpia de seguretat

```bash
# la base de dades és un fitxer normal al teu disc
cp ./data/tensio.db ./tensio-backup.db
```

## Ús

DATA_DIR=./data PORT=3000 node server.js

1. Omple **data, hora, sistòlica, diastòlica** (pols i notes són opcionals) i prem
   **Desar lectura**. La data i l'hora es preomplen amb el moment actual.
2. A la pestanya **Llista** veus totes les lectures i el resum; pots editar o esborrar.
3. A la pestanya **Calendari** navegues mes a mes; cada dia mostra la mitjana i les lectures.
4. A la pestanya **Exportar** tries el rang de dies (o un atall com "Últims 30 dies")
   i el format, i descarregues el fitxer.

## Arquitectura

```
.
├── docker-compose.yml      # servei + volum persistent
├── Dockerfile              # imatge node:22-slim
├── backend/
│   ├── server.js           # API REST + serveix el frontend
│   ├── db.js               # esquema SQLite (node:sqlite)
│   ├── classify.js         # classificació de tensió + utilitats de data
│   ├── export.js           # generació de CSV i PDF (pdfkit)
│   └── package.json
└── frontend/
    ├── index.html          # interfície (parla amb l'API)
    ├── favicon.svg          # icones i manifest PWA
    └── site.webmanifest
```

### API

| Mètode | Ruta                          | Funció                                         |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/readings?from&to`       | llistar lectures (filtre per rang opcional)    |
| POST   | `/api/readings`               | crear una lectura                              |
| PUT    | `/api/readings/:id`           | editar una lectura                             |
| DELETE | `/api/readings/:id`           | esborrar una lectura                           |
| GET    | `/api/stats?from&to`          | resum estadístic d'un rang                     |
| GET    | `/api/export?format&from&to`  | exportar (`format` = `csv` \| `pdf` \| `calendar` \| `json`) |
| POST   | `/api/import`                 | importar lectures des d'un JSON                    |

## Classificació de la tensió

Es classifica pel valor més desfavorable entre sistòlica i diastòlica:

| Categoria            | Sistòlica (mmHg) | Diastòlica (mmHg) |
| -------------------- | ---------------- | ----------------- |
| Òptima               | < 120            | < 80              |
| Normal               | 120–129          | 80–84             |
| Normal-alta          | 130–139          | 85–89             |
| Hipertensió grau 1   | 140–159          | 90–99             |
| Hipertensió grau 2   | 160–179          | 100–119           |
| Crisi hipertensiva   | ≥ 180            | ≥ 120             |

## Nota

Aquesta és una eina de registre personal, **no assessorament mèdic**. La classificació
és orientativa i segueix llindars habituals; qualsevol decisió sobre la teva tensió
arterial l'has de prendre amb el teu professional sanitari.

## Llicència

Ús personal.
