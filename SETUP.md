# E-Trike Finder + LGU Records — setup with Google Sheets (free, about 15 minutes)

Everything is stored in **your Google Sheet** and run by a free **Google Apps Script**. No Firebase.

Files:
- `index.html` — drivers and passengers
- `admin.html` — LGU staff records page
- `Code.gs` — the script that goes inside the Google Sheet
- The Google Sheet **E-Trike Records (Isabel)** (in the same Drive folder)

Both pages open in DEMO mode (sample data) until you finish the steps below.

## 1. Put the script in the Sheet
1. Open the Google Sheet **E-Trike Records (Isabel)** → menu **Extensions → Apps Script**.
2. Delete the sample code. Open `Code.gs`, copy everything, paste it in. Click **Save** (💾).
3. At the top of the script, change `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the LGU staff login you want
   (password at least 8 characters).
4. In the toolbar, pick the function **setup** in the drop-down → **Run**. Accept the permission prompts
   (Google may warn "unverified app" — click Advanced → Go to project; it is your own script).
   This creates the tabs Shifts, Trips, Tracks, Audit in the sheet.
5. Pick **setAdmin** → **Run**. Then **erase the password** from the top of the script and Save again.
   (Only a scrambled version is kept.)
6. Pick **installDailyCleanup** → **Run**. This deletes old records automatically every night
   (GPS trail after 30 days, trips and time in/out after 180 days, staff log after 365 days — change these in `CFG`
   at the top of the script, with the Data Protection Officer's advice).

To add another staff member later: change `ADMIN_EMAIL`/`ADMIN_PASSWORD`, run **setAdmin** again, erase the password.
To remove one: set `ADMIN_EMAIL` to their email and run **removeAdmin**.

## 2. Publish it as a web app
1. In the Apps Script page: **Deploy → New deployment** → gear icon → **Web app**.
2. **Execute as:** Me. **Who has access:** Anyone. Click **Deploy**.
3. Copy the **Web app URL** (ends with `/exec`).

Important: whenever you change `Code.gs` later, use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
or the change will not go live.

## 3. Connect the pages
Open `index.html` and `admin.html`, find `API_URL: "",` near the top of the script and paste the URL between the quotes
(same URL in both files). In `index.html` you can also change `ORG` (name shown in the passenger privacy notice).

## 4. Put the pages online (GitHub Pages)
Repo → Settings → Pages → Deploy from branch → `main` / root. Then:
- Drivers and passengers: `https://mvcashbel-art.github.io/etriketracker/`
- LGU records: `https://mvcashbel-art.github.io/etriketracker/admin.html` (sign in with the email/password from step 1)

## 5. Print QR stickers
admin.html → sign in → **QR stickers** → type each e-trike's body number → Make stickers → Print.
Put one sticker inside each e-trike where the passenger can scan it.

## What gets recorded (in the Sheet)
- **Shifts:** driver time in / time out (name, body number, phone).
- **Tracks:** a GPS point about every 30 seconds while a driver is online.
- **Trips:** passenger name and number (after scanning the QR), e-trike, driver, start/end time and place.
- **Audit:** every staff login, search and export.
Live positions are kept only briefly in the script's memory, not in the sheet.

## Keep the Sheet private
Share the Google Sheet only with people who really need to open it directly (the owner and maybe one backup).
Anyone with edit access to the Sheet can see all records. Day-to-day, LGU staff use `admin.html`.

## Things the LGU still has to decide
- **Retention periods** (in `CFG`) and the **wording of the passenger consent** — have the Data Protection Officer / legal office review.
- **Releasing records to police** — agree on a written request process.
- **Who is an admin** — keep the list short.

## Known limits
- **Speed:** Google scripts are slower than a real server. Expect positions to be about 5–15 seconds behind.
- **Google limits:** a free Google account has daily limits on scripts. A pilot of a few dozen drivers should be fine,
  but I have not tested it at that size. If it slows down or errors with many users, the next step is a proper server/database.
- Passenger names/numbers are typed in and not verified (no SMS code).
- Browsers stop sending location when the phone screen is off or the app is closed, so drivers must keep the screen on.
- Anyone who knows the web app URL could try to send fake positions or trips (they cannot read records without the admin login).
  Fine for a pilot; for a full rollout add driver PIN/login.
- Five wrong admin passwords lock that email for 10 minutes (this also means someone could annoy staff by trying; wait it out).
- I tested this with a simulator of Google's services, not on a real Google account. Test with 2–3 phones first.
