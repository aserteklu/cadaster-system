# CadaSys — Digital Cadastral Land Registration System
**Version 2.1.0** | Computer-Aided Land Management Platform

---

## ትሕዝቶ / Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [File Structure](#file-structure)
4. [How to Run](#how-to-run)
5. [User Guide](#user-guide)
6. [Data Model](#data-model)
7. [Offline / Sync](#offline--sync)
8. [Export & Backup](#export--backup)
9. [Deployment Options](#deployment-options)
10. [Customization](#customization)
11. [Technical Notes](#technical-notes)

---

## Overview

CadaSys is a **browser-based, offline-first** digital cadastral registration system built for land administration bureaus. It requires **no installation**, no internet connection to operate, and runs entirely from three files:

```
index.html   — User interface (all tabs, forms, modals)
style.css    — Design system and layout
app.js       — All business logic, data management, and state
```

It is modelled on best practices from:
- **Nigeria PENCOM** cadaster system (district-level target tracking)
- **Ethiopia ELAR / Oromia** land registry (farmer profile + certificate workflow)
- **Rwanda LAIS** (offline-first mobile data capture + sync)

The system is **generic and configurable** — it is not hardcoded for any specific region. You configure the region name, number of districts, certificate prefix, and area unit in Settings.

---

## Features

### 1. Dashboard
- Real-time KPI cards: total districts, registered farmers, total hectares, certificates issued
- Overall registration progress bar
- Activity log (last 50 actions)
- District performance ranking

### 2. Districts / Woredas Management
- Add unlimited districts (not limited to 49 or any fixed number)
- Each district has: name, zone, farmer target, hectare target, GPS center, status
- Filter by status (active / pending / completed)
- Progress bar per district based on registered farmers vs. target
- Edit status and delete districts

### 3. Farmer Registry
- Full farmer profile: name (3-part), national ID, gender, phone, spouse/co-owner
- Land parcel: area, land use type, parcel ID, acquisition type, boundary description
- GPS coordinate capture (real device GPS or simulated for demo)
- Document attachment (ID, photo, previous certificate)
- Filter by district and status
- Issue land certificate directly from farmer record

### 4. Land Registration Form
- Complete data entry form for fieldwork
- GPS capture button (uses browser Geolocation API)
- Save as draft (status: pending) or submit (status: registered)
- Offline mode: saves locally, queues for sync

### 5. Certificates
- View all issued certificates
- Print-ready certificate generator (opens print dialog)
- Certificate format: bureau name, farmer details, parcel, GPS, official signature lines

### 6. Land Transfer History
- Record transfers: inheritance, rental, gift, redistribution, sale
- Full audit trail: from → to, type, date, notes
- Prevents ownership confusion

### 7. Reports & Analytics
- Summary statistics
- Per-district bar chart (completion %)
- Detailed district table: target, registered, certified, hectares, %
- Export any report as CSV (one click)

### 8. Settings
- Configure region/bureau name, certificate prefix, area unit
- Export full database as JSON (backup)
- Import JSON backup (restore)
- Clear all data
- Configure server sync URL and API key
- Toggle auto-sync

---

## File Structure

```
cadaster-system/
├── index.html      Main HTML — all tabs, forms, modals
├── style.css       All styles — layout, components, responsive
├── app.js          All logic — DB, business rules, UI rendering
└── README.md       This documentation
```

---

## How to Run

### Option A — Open directly in browser (simplest)
1. Copy the three files (`index.html`, `style.css`, `app.js`) into one folder
2. Double-click `index.html` — it opens in any modern browser
3. No server, no internet, no installation needed

### Option B — Local web server (recommended for GPS)
GPS capture requires HTTPS or localhost. Use any of:

```bash
# Python (if installed)
python3 -m http.server 8080
# then open http://localhost:8080

# Node.js (if installed)
npx serve .
# then open the URL shown

# VS Code: install "Live Server" extension, click "Go Live"
```

### Option C — Deploy to GitHub Pages (free hosting)
1. Create a GitHub repository
2. Upload the three files
3. Go to Settings → Pages → Source: main branch
4. Your system is live at `https://yourusername.github.io/yourrepo/`

### Option D — Deploy to any web host
Upload the three files to any shared hosting, VPS, or cloud storage (S3, Firebase Hosting, Netlify, Vercel — all work with static files).

---

## User Guide

### First-time Setup
1. Open the app → go to **Settings** tab
2. Enter your **Region Name** (e.g. "Tigray, Ethiopia")
3. Enter your **Bureau Name** (e.g. "Bureau of Land Administration")
4. Set **Certificate Prefix** (e.g. `TG` → certificates will be `TG-2024-00001`)
5. Select **Area Unit** (hectares, acres, or m²)
6. Click **Save Settings**

### Adding Districts
1. Go to **Districts** tab
2. Click **+ Add District**
3. Fill in: district name, zone, farmer target, hectare target, approximate GPS center
4. Click **Add District**
5. Repeat for all districts/woredas

> **Tip:** You can add or remove districts at any time. The system is not limited to any fixed number.

### Registering a Farmer
1. Go to **Register Land** tab
2. Fill in farmer's name, ID, gender, phone
3. Select district, enter village/kebele name
4. Click **⌖ Capture GPS Location** (or enter coordinates manually)
5. Enter parcel area, land use type, parcel ID, acquisition type
6. Add boundary description (N/S/E/W neighbors)
7. Add spouse/co-owner if applicable
8. Attach documents (ID scan, photo, old certificate)
9. Click **✦ Submit Registration** — farmer is saved as "registered"
   - Or click **⊡ Save Draft** to save as "pending" for later completion

### Issuing a Certificate
1. Go to **Farmers** tab
2. Find the farmer (use search or filter)
3. Click **🏅 Cert** button on their row
4. Certificate number is auto-generated (e.g. `TG-2024-00042`)
5. To print: go to **Certificates** tab → click **🖨 Print**

### Recording a Transfer
1. Go to **Transfers** tab
2. Click **+ Record Transfer**
3. Enter certificate number, current owner (From), new owner (To), transfer type, date
4. Click **Record Transfer**

### Exporting a Report
1. Go to **Reports** tab
2. Click **⬇ Export CSV** on any table
3. A `.csv` file downloads — open in Excel or Google Sheets

---

## Data Model

All data is stored in `localStorage` under these keys:

| Key | Description |
|-----|-------------|
| `cs_settings` | System configuration |
| `cs_districts` | Array of district objects |
| `cs_farmers` | Array of farmer/parcel records |
| `cs_transfers` | Array of transfer records |
| `cs_activity` | Last 50 activity log entries |
| `cs_pending` | Queue of offline records awaiting sync |

### Farmer Record Fields
```json
{
  "id": "unique-id",
  "firstName": "Tesfay",
  "fatherName": "Haile",
  "grandfatherName": "Selassie",
  "nationalId": "ETH-1234567",
  "gender": "male",
  "phone": "+251911234567",
  "districtId": "district-id",
  "village": "Kebele Name",
  "lat": "14.1209",
  "lng": "38.7197",
  "hectares": 1.25,
  "landUse": "crop",
  "parcelId": "P-ABC123",
  "acquisition": "original",
  "boundaries": "N: neighbor, S: road, E: river, W: neighbor",
  "spouse": "Letay Gebremichael",
  "spouseId": "ETH-7654321",
  "status": "registered",
  "certNumber": "TG-2024-00001",
  "certIssuedAt": "2024-03-15",
  "registeredAt": "2024-03-15",
  "docs": {}
}
```

### District Record Fields
```json
{
  "id": "unique-id",
  "name": "Kilte Awlaelo",
  "zone": "Eastern",
  "target": 5000,
  "hectaresTarget": 8000,
  "lat": 14.27,
  "lng": 39.53,
  "status": "active",
  "createdAt": "2024-01-01"
}
```

---

## Offline / Sync

### How Offline Works
- All data is written to `localStorage` — it persists even if the browser is closed
- Click the **⚡ button** in the top bar to toggle offline mode
- In offline mode, registrations are saved locally AND added to a pending sync queue
- When connectivity returns, click **Settings → Sync Now** to push pending records

### Server Sync (Optional)
If you have a backend server:
1. Go to **Settings → Offline / Sync Settings**
2. Enter your **Server Sync URL** (e.g. `https://your-server.com/api/sync`)
3. Enter **API Key** if required
4. Enable **Auto-sync when online**

The system sends a `POST` request with:
```json
{
  "records": [...farmerObjects],
  "timestamp": 1234567890
}
```

Your server should respond with `HTTP 200` on success.

### Without a Server
The system works perfectly as a **standalone local tool** — no sync server needed. Use **Export All Data** to create JSON backups and **Import Data** to restore or merge across devices.

---

## Export & Backup

### Export All Data
Settings → **⬇ Export** → saves `cadasys_backup_YYYY-MM-DD.json`

This JSON file contains all settings, districts, farmers, transfers, and activity log. Keep regular backups.

### Import Data
Settings → **⬆ Import** → select a `.json` backup file

⚠ **Warning:** Import replaces all current data.

### Export CSV Reports
Reports tab → **⬇ CSV** buttons → Excel/Google Sheets compatible

---

## Deployment Options

| Option | Cost | Internet needed? | Best for |
|--------|------|-----------------|----------|
| Local file (double-click) | Free | No | Single computer use |
| Local server (Python/Node) | Free | No (LAN only) | Office LAN use |
| GitHub Pages | Free | Yes | Small bureau, public |
| Netlify / Vercel | Free tier | Yes | Reliable free hosting |
| VPS / Cloud VM | ~$5/month | Yes | Full control, API sync |
| Firebase Hosting | Free tier | Yes | Google ecosystem |

---

## Customization

### Change the Language
All UI text is in `index.html`. Search and replace English labels with Tigrinya, Amharic, or any language. The system has no hardcoded language dependency.

### Add More Fields
In `index.html`: add new `<input>` fields inside any form card.
In `app.js`: add the field to the record object in `submitRegistration()`.

### Change Colors
In `style.css`, edit the `:root` CSS variables:
```css
--sidebar-accent: #22d3a5;   /* main green accent */
--sidebar-bg: #0d1117;       /* dark sidebar */
--bg-main: #f4f5f7;          /* page background */
```

### Add GIS/Map View
To add an interactive map, include Leaflet.js:
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
```
Then create a map div and plot farmer coordinates using `L.marker([lat, lng])`.

### Connect to PostgreSQL + PostGIS (Full Backend)
For production with many users and GIS capabilities:
1. Build a REST API (Django/Node.js) with PostgreSQL + PostGIS
2. Set the sync URL in Settings
3. The frontend sends farmer records; the backend stores them with geometry types
4. Add a map tab using Leaflet + WMS/GeoJSON layers from PostGIS

---

## Technical Notes

- **No frameworks** — pure HTML, CSS, JavaScript. Zero npm, zero build step.
- **localStorage limit** — typically 5–10 MB per browser. For large deployments (100,000+ farmers), connect a backend database.
- **Browser support** — works on Chrome, Firefox, Edge, Safari. IE not supported.
- **GPS accuracy** — depends on device. Smartphones give ~3–5m accuracy. Desktop browsers simulate or prompt.
- **Print certificates** — uses browser print dialog. For PDF, use "Save as PDF" from the print dialog.
- **Security** — for production use, add HTTPS, user authentication, and server-side validation. The current system has no login (add one if multiple users with different roles need access control).

---

## Quick Start Checklist

- [ ] Open `index.html` in browser
- [ ] Go to Settings → configure region name, bureau, certificate prefix
- [ ] Go to Districts → add your districts/woredas
- [ ] Go to Register Land → register first farmer
- [ ] Go to Farmers → issue certificate
- [ ] Go to Reports → export CSV
- [ ] Go to Settings → Export All Data (create first backup)

---

*CadaSys — Built for land equity, farmer dignity, and good governance.*
