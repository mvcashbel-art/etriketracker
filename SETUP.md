# E-Trike Finder + LGU Records — setup (about 20 minutes, free tier)

Files: `index.html` (drivers + passengers), `admin.html` (LGU staff), `database-rules.json`.
Both pages open in DEMO mode with sample data until you do the steps below.

## 1. Create the database
1. https://console.firebase.google.com → Add project (e.g. `etrike-isabel`). Google Analytics: off.
2. Build → **Realtime Database** → Create database → location **Singapore** → start in **locked mode**.
3. Copy the database URL shown at the top of the Data tab
   (looks like `https://etrike-isabel-default-rtdb.asia-southeast1.firebasedatabase.app`).

## 2. Create the LGU admin login (do this while the database is still empty)
1. Build → **Authentication** → Get started → Sign-in method → enable **Email/Password**.
2. Users tab → **Add user** → the LGU staff email + a strong password. Copy that user's **User UID**.
3. Back in Realtime Database → Data tab → ⋮ menu → **Import JSON**, using a file containing:
   `{ "admins": { "PASTE-THE-UID-HERE": true } }`
   Repeat (add more UIDs) for each staff member who may see records. Only UIDs listed here can read records.

## 3. Security rules
Realtime Database → **Rules** tab → paste the contents of `database-rules.json` → Publish.
What they do: anyone can see live e-trike positions; only listed admins can read trips, time in/out records,
GPS trails and the audit log; closed trips and time-in/out records cannot be edited afterwards.

## 4. Fill in the settings
- `index.html` → top of the script: `FIREBASE_URL` (and `ORG` if you want a different name in the privacy notice).
- `admin.html` → `FIREBASE_URL` (same) and `FIREBASE_API_KEY`
  (Project settings ⚙ → General → **Web API Key**; if none is shown, click "Add app" → Web).

## 5. Put it online
Upload `index.html` and `admin.html` to a GitHub repo → Settings → Pages. It must be https:// so phones allow GPS.
Admin page: `https://YOUR-SITE/admin.html`. Passenger page: `https://YOUR-SITE/index.html`.

## 6. Print QR stickers
Open admin.html → sign in → **QR stickers** → enter each e-trike's body number → Make stickers → Print.
Each sticker opens the passenger page for that e-trike. Put one inside every e-trike where passengers can scan it.

## What gets recorded
- **Driver:** time in / time out (name, body number, phone) and a GPS point about every 30 seconds while online.
- **Passenger (after scanning the QR):** name, mobile number, e-trike, driver, start/end time and place.
- **Staff:** every login, search, export and sticker print is written to an audit log.

## Things the LGU still has to decide (not built in)
- **Deleting old records.** Nothing is deleted automatically. Set a retention period (with the Data Protection
  Officer) and delete older `tracks`, `trips`, `shifts` in the Firebase console, or ask for an automatic clean-up to be added.
- **Privacy notice wording.** The consent text in the passenger page is a draft. Have the DPO / legal office review it
  and the Data Privacy Act registration needs.
- **Releasing records to police.** Agree on a written request process.
- **Who is an admin.** Keep the list short; remove staff who leave.

## Known limits
- The passenger's name/number are typed in by them and not verified (no SMS code yet).
- Browsers stop sending location when the phone screen is off or the app is closed — drivers must keep the screen on.
- Anyone who knows the database URL could try to add fake positions or trips (they cannot read or change closed records).
  Fine for a pilot; for a full rollout, add driver login/PIN and move to a server.
- The rules and the Firebase login steps are written to Firebase's documented behavior but I could not test them
  against a real Firebase project from here; test with 2–3 phones before rollout.
