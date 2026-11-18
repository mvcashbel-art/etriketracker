# E-Trike Finder + LGU Records (Isabel, Leyte)

A phone web app that shows passengers which e-trikes are nearby, and gives the LGU records of
driver time in/out, GPS trails and passenger trips. Data is stored in a Google Sheet (free) via Google Apps Script.

- `index.html` — drivers (Time in / Go online) and passengers (map, nearest e-trike, QR trip start)
- `admin.html` — LGU staff: live map, trips, time in/out, route trace, "who was near here", QR stickers
- `Code.gs` — Google Apps Script backend (paste into the Sheet: Extensions → Apps Script)
- `SETUP.md` — step-by-step setup

Both pages open in demo mode with sample data until `API_URL` is filled in.
