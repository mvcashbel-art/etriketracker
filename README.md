# E-Trike Finder + LGU Records (Isabel, Leyte)

A phone web app that shows passengers which e-trikes are nearby, and gives the LGU records of
driver time in/out, GPS trails and passenger trips.

- `index.html` — drivers (Time in / Go online) and passengers (map, nearest e-trike, QR trip start)
- `admin.html` — LGU staff: live map, trips, time in/out, route trace, "who was near here", QR stickers, audit log
- `database-rules.json` — Firebase Realtime Database security rules
- `SETUP.md` — how to go live (Firebase + GitHub Pages)

Both pages open in demo mode with sample data until `FIREBASE_URL` is filled in.
