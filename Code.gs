/**
 * E-TRIKE FINDER — backend on Google Sheets + Google Apps Script (free)
 *
 * HOW TO INSTALL (details in SETUP.md):
 *  1. Open the Google Sheet "E-Trike Records (Isabel)" → Extensions → Apps Script.
 *  2. Delete the sample code, paste this whole file, Save.
 *  3. Edit ADMIN_EMAIL and ADMIN_PASSWORD just below, then run  setup  once, then  setAdmin  once
 *     (Run button, pick the function in the drop-down; accept the permission prompts).
 *  4. After setAdmin runs, ERASE the password from the line below and Save again.
 *  5. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *     Copy the Web app URL into API_URL in index.html and admin.html.
 *  6. (Optional but recommended) run  installDailyCleanup  once to delete old records automatically.
 *  After changing this code later: Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 */

const ADMIN_EMAIL = 'lgu@example.com';   // LGU staff login (email)
const ADMIN_PASSWORD = 'CHANGE-ME-8+chars';   // erase after running setAdmin

const CFG = {
  STALE_SEC: 90,            // a trike with no update for this long is hidden from passengers
  TRACK_RETAIN_DAYS: 30,    // GPS trail kept this many days (daily cleanup)
  RECORD_RETAIN_DAYS: 180,  // trips and time in/out kept this many days
  AUDIT_RETAIN_DAYS: 365,   // staff activity log
  SESSION_HOURS: 6          // admin stays signed in this long (max 6)
};
const TZ = 'Asia/Manila';

const SCHEMA = {
  Shifts: ['id', 'startAt', 'endAt', 'lastAt', 'status', 'body', 'name', 'phone', 'driverId', 'note'],
  Trips:  ['id', 'startAt', 'endAt', 'status', 'body', 'driverId', 'driverName', 'driverPhone', 'pName', 'pPhone', 'startLat', 'startLng', 'endLat', 'endLng'],
  Tracks: ['ts', 'body', 'lat', 'lng', 'driverId'],
  Audit:  ['at', 'email', 'action', 'detail']
};
const TIME_COLS = { Shifts: ['startAt', 'endAt', 'lastAt'], Trips: ['startAt', 'endAt'], Tracks: ['ts'], Audit: ['at'] };
const TEXT_COLS = { Shifts: ['phone'], Trips: ['driverPhone', 'pPhone'] };   // keep leading zeros

/* ------------------------------------------------------------ web app entry points */
function doGet(e){
  try{
    const a = e && e.parameter ? e.parameter.action : '';
    if (a === 'live') return json_(live_());
    return json_({ ok: true, service: 'e-trike-finder' });
  }catch(err){ return json_({ ok: false, error: String(err && err.message || err) }); }
}
function doPost(e){
  try{
    const p = JSON.parse(e.postData.contents);
    const h = ROUTES[p.action];
    if (!h) throw new Error('Unknown action');
    return json_(h(p));
  }catch(err){ return json_({ ok: false, error: String(err && err.message || err) }); }
}
const ROUTES = {
  ping: p => ping_(p), shiftStart: p => shiftStart_(p), shiftEnd: p => shiftEnd_(p),
  tripStart: p => tripStart_(p), tripEnd: p => tripEnd_(p),
  login: p => login_(p),
  trips: p => admin_(p, 'view-trips', '', () => ({ ok: true, trips: readTail_('Trips', 1000).map(strip_) })),
  shifts: p => admin_(p, 'view-shifts', '', () => ({ ok: true, shifts: shiftsView_() })),
  bodies: p => admin_(p, null, '', () => ({ ok: true, bodies: bodies_() })),
  track: p => admin_(p, 'route', [p.body, p.day, p.from, p.to].join(' '), () => track_(p)),
  near: p => admin_(p, 'near-search', [p.lat, p.lng, 'r=' + p.radius, p.day, p.from, p.to].join(' '), () => near_(p)),
  log: p => admin_(p, ['export-trips', 'export-shifts', 'make-qr'].indexOf(p.what) >= 0 ? p.what : 'other', p.detail, () => ({ ok: true }))
};
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ------------------------------------------------------------ small helpers */
const str_ = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const num_ = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v;
const cleanPhone_ = p => String(p || '').replace(/[^\d+]/g, '').slice(0, 16);
const bodyKey_ = s => String(s || '').trim().toUpperCase().replace(/[.$#\[\]\/\s]+/g, '_').slice(0, 12);
const ms_ = v => v instanceof Date ? v.getTime() : (v === '' || v == null ? null : Number(v));
function locked_(fn){
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try{ return fn(); } finally { lock.releaseLock(); }
}
function km_(a, b){
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------------------ sheet access */
function sheet_(name){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    const head = SCHEMA[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(c => sh.getRange(2, head.indexOf(c) + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@'));
  }
  return sh;
}
function toRow_(name, o){
  return SCHEMA[name].map(k => {
    const v = o[k];
    if (v === null || v === undefined) return '';
    return TIME_COLS[name].indexOf(k) >= 0 ? new Date(v) : v;
  });
}
function fromRow_(name, row){
  const o = {};
  SCHEMA[name].forEach((k, i) => {
    const v = row[i];
    if (TIME_COLS[name].indexOf(k) >= 0) o[k] = ms_(v);
    else if (k === 'lat' || k === 'lng' || k === 'startLat' || k === 'startLng' || k === 'endLat' || k === 'endLng') o[k] = v === '' ? null : +v;
    else o[k] = v === '' ? null : String(v);
  });
  return o;
}
const strip_ = o => { const c = Object.assign({}, o); delete c._row; return c; };
function appendRow_(name, o){ sheet_(name).appendRow(toRow_(name, o)); }
function readTail_(name, n){
  const sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - n + 1), w = SCHEMA[name].length;
  return sh.getRange(start, 1, last - start + 1, w).getValues().map((r, i) => Object.assign(fromRow_(name, r), { _row: start + i }));
}
function findRow_(name, id){
  const sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(id)) return i + 2;
  return 0;
}
function getRow_(name, row){ return fromRow_(name, sheet_(name).getRange(row, 1, 1, SCHEMA[name].length).getValues()[0]); }
function putRow_(name, row, o){ sheet_(name).getRange(row, 1, 1, SCHEMA[name].length).setValues([toRow_(name, o)]); }
function tracksBetween_(t0, t1, body){
  const sh = sheet_('Tracks'), out = [];
  let end = sh.getLastRow();
  while (end >= 2){
    const start = Math.max(2, end - 19999);
    const vals = sh.getRange(start, 1, end - start + 1, 5).getValues();
    vals.forEach(r => {
      const t = ms_(r[0]);
      if (t >= t0 && t <= t1 && (!body || r[1] === body)) out.push({ t: t, body: r[1], lat: +r[2], lng: +r[3] });
    });
    if (ms_(vals[0][0]) < t0) break;      // rows are in time order, so earlier chunks are older still
    end = start - 1;
  }
  return out.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------ live positions (kept in cache, not in the sheet) */
function liveGet_(){ const s = CacheService.getScriptCache().get('live'); return s ? JSON.parse(s) : {}; }
function livePut_(o){
  const cut = Date.now() - 10 * 60 * 1000;
  Object.keys(o).forEach(k => { if (o[k].ts < cut) delete o[k]; });
  CacheService.getScriptCache().put('live', JSON.stringify(o), 21600);
}
function live_(){
  const now = Date.now(), live = liveGet_();
  return { ok: true, trikes: Object.keys(live).map(id => {
    const v = live[id];
    return { id: id, name: v.name, body: v.body, phone: v.phone, lat: v.lat, lng: v.lng, acc: v.acc, status: v.status, onTrip: !!v.onTrip, age: Math.round((now - v.ts) / 1000) };
  }) };
}

/* ------------------------------------------------------------ drivers */
function ping_(p){
  const id = str_(p.id, 40), lat = +p.lat, lng = +p.lng;
  if (!id || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('bad position');
  const body = str_(p.body, 12).toUpperCase(), name = str_(p.name, 30);
  if (!body || !name) throw new Error('name and body number required');
  let onTrip = false;
  locked_(() => {
    const live = liveGet_(), prev = live[id] || {};
    onTrip = !!prev.onTrip;
    live[id] = { name: name, body: body, phone: cleanPhone_(p.phone), lat: lat, lng: lng, acc: +p.acc || 0,
                 status: p.status === 'busy' ? 'busy' : 'free', ts: Date.now(), onTrip: prev.onTrip || '' };
    livePut_(live);
  });
  if (p.crumb){
    appendRow_('Tracks', { ts: Date.now(), body: bodyKey_(body), lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, driverId: id });
    const sid = str_(p.shiftId, 40);
    if (sid){
      const row = findRow_('Shifts', sid);
      if (row) sheet_('Shifts').getRange(row, SCHEMA.Shifts.indexOf('lastAt') + 1).setValue(new Date());
    }
  }
  return { ok: true, onTrip: onTrip };
}
function shiftStart_(p){
  const now = Date.now();
  const s = { id: str_(p.id, 40), startAt: now, lastAt: now, status: 'open', body: bodyKey_(p.body), name: str_(p.name, 30), phone: cleanPhone_(p.phone), driverId: str_(p.driverId, 40) };
  if (!s.id || !s.body || !s.name || !s.driverId) throw new Error('missing fields');
  locked_(() => {
    readTail_('Shifts', 300).forEach(r => {                 // same driver still "open" = app was closed without time-out
      if (r.driverId === s.driverId && r.status === 'open' && r.id !== s.id){
        r.status = 'closed'; r.endAt = r.lastAt || r.startAt; r.note = 'app closed unexpectedly';
        putRow_('Shifts', r._row, r);
      }
    });
    if (!findRow_('Shifts', s.id)) appendRow_('Shifts', s);
  });
  return { ok: true };
}
function shiftEnd_(p){
  const id = str_(p.id, 40), driverId = str_(p.driverId, 40);
  locked_(() => {
    const row = id ? findRow_('Shifts', id) : 0;
    if (row){
      const r = getRow_('Shifts', row);
      if (r.driverId === driverId && r.status === 'open'){ r.status = 'closed'; r.endAt = Date.now(); putRow_('Shifts', row, r); }
    }
    const live = liveGet_();
    if (live[driverId]){ delete live[driverId]; livePut_(live); }
  });
  return { ok: true };
}

/* ------------------------------------------------------------ passengers */
function tripStart_(p){
  const id = str_(p.id, 40), body = bodyKey_(p.body), pName = str_(p.pName, 40), pPhone = cleanPhone_(p.pPhone);
  if (!id || !body || pName.length < 2 || pPhone.replace(/\D/g, '').length < 10) throw new Error('missing passenger details');
  let out = { trikeId: null, driverName: null };
  locked_(() => {
    const existing = findRow_('Trips', id);
    if (existing){ const r = getRow_('Trips', existing); out = { trikeId: r.driverId, driverName: r.driverName }; return; }
    const now = Date.now(), live = liveGet_();
    const cands = Object.keys(live).filter(k => bodyKey_(live[k].body) === body && now - live[k].ts < CFG.STALE_SEC * 1000)
      .sort((a, b) => live[b].ts - live[a].ts);
    let drv = null;
    if (cands.length){ drv = live[cands[0]]; drv.id = cands[0]; live[cands[0]].onTrip = id; livePut_(live); }
    appendRow_('Trips', { id: id, startAt: now, status: 'active', body: body, driverId: drv ? drv.id : null, driverName: drv ? drv.name : null,
      driverPhone: drv ? drv.phone : null, pName: pName, pPhone: pPhone, startLat: num_(p.lat), startLng: num_(p.lng) });
    out = { trikeId: drv ? drv.id : null, driverName: drv ? drv.name : null };
  });
  return { ok: true, trikeId: out.trikeId, driverName: out.driverName };
}
function tripEnd_(p){
  const id = str_(p.id, 40);
  locked_(() => {
    const row = id ? findRow_('Trips', id) : 0;
    if (row){
      const r = getRow_('Trips', row);
      if (r.status === 'active'){ r.status = 'done'; r.endAt = Date.now(); r.endLat = num_(p.lat); r.endLng = num_(p.lng); putRow_('Trips', row, r); }
    }
    const live = liveGet_();
    let changed = false;
    Object.keys(live).forEach(k => { if (live[k].onTrip === id){ live[k].onTrip = ''; changed = true; } });
    if (changed) livePut_(live);
  });
  return { ok: true };
}

/* ------------------------------------------------------------ LGU admin */
function hash_(salt, pass){ return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pass)); }
function login_(p){
  const email = str_(p.email, 80).toLowerCase(), pass = String(p.password || '');
  const cache = CacheService.getScriptCache(), fk = 'fail_' + email, fails = +(cache.get(fk) || 0);
  if (fails >= 5) throw new Error('Too many attempts. Try again in 10 minutes.');
  const admins = JSON.parse(PropertiesService.getScriptProperties().getProperty('ADMINS') || '{}');
  const a = admins[email];
  if (!a || hash_(a.salt, pass) !== a.hash){ cache.put(fk, String(fails + 1), 600); throw new Error('Wrong email or password.'); }
  cache.remove(fk);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, email, Math.min(CFG.SESSION_HOURS, 6) * 3600);
  audit_(email, 'login', '');
  return { ok: true, token: token, email: email };
}
function admin_(p, action, detail, fn){
  const email = CacheService.getScriptCache().get('tok_' + str_(p.token, 100));
  if (!email) throw new Error('Session expired. Please sign in again.');
  if (action) audit_(email, action, detail);
  return fn();
}
function audit_(email, action, detail){ appendRow_('Audit', { at: Date.now(), email: email, action: action, detail: str_(detail, 300) }); }
function shiftsView_(){
  const live = liveGet_(), now = Date.now();
  return readTail_('Shifts', 1000).map(r => {
    const o = strip_(r), lv = live[o.driverId];
    if (o.status === 'open') o.state = (lv && now - lv.ts < 120000) ? 'on' : 'cut';
    else o.state = o.note ? 'cut' : 'out';
    if (o.state === 'cut' && !o.endAt) o.endAt = o.lastAt;
    return o;
  });
}
function bodies_(){
  const seen = {};
  readTail_('Shifts', 2000).forEach(r => { if (r.body) seen[r.body] = 1; });
  return Object.keys(seen).sort();
}
function dayRange_(p){
  const day = str_(p.day, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('bad date');
  const hm = s => /^\d{2}:\d{2}$/.test(String(s)) ? s : '00:00';
  return [Date.parse(day + 'T' + hm(p.from) + ':00+08:00'), Date.parse(day + 'T' + hm(p.to || '23:59') + ':00+08:00') + 59999];
}
function track_(p){
  const r = dayRange_(p);
  return { ok: true, points: tracksBetween_(r[0], r[1], bodyKey_(p.body)).map(x => ({ t: x.t, lat: x.lat, lng: x.lng })) };
}
function near_(p){
  const r = dayRange_(p), c = { lat: +p.lat, lng: +p.lng }, rad = Math.min(Math.max(+p.radius || 300, 50), 3000);
  if (!isFinite(c.lat) || !isFinite(c.lng)) throw new Error('bad place');
  const per = {};
  tracksBetween_(r[0], r[1], null).forEach(x => {
    const d = km_(c, x) * 1000;
    if (d > rad) return;
    const e = per[x.body] || (per[x.body] = { body: x.body, d: d, t: x.t, n: 0 });
    e.n++; if (d < e.d){ e.d = d; e.t = x.t; }
  });
  const shifts = readTail_('Shifts', 2000), trips = readTail_('Trips', 2000);
  const out = Object.keys(per).map(b => {
    const e = per[b];
    e.drivers = shifts.filter(s => s.body === b && s.startAt <= e.t && (s.status === 'open' || (s.endAt || s.lastAt || 0) >= e.t - 60000))
      .map(s => s.name + ' (' + (s.phone || '—') + ')').filter((v, i, a) => a.indexOf(v) === i);
    e.trips = trips.filter(t => t.body === b && t.startAt <= r[1] && (t.endAt || Date.now()) >= r[0]).map(t => ({ pName: t.pName, pPhone: t.pPhone }));
    return e;
  }).sort((a, b) => a.d - b.d);
  return { ok: true, results: out };
}

/* ------------------------------------------------------------ one-time setup helpers (run from the editor) */
function setup(){
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(TZ);
  Object.keys(SCHEMA).forEach(sheet_);
  Logger.log('Sheets ready.');
}
function addAdmin(email, password){
  email = String(email || '').trim().toLowerCase();
  if (!email || String(password || '').length < 8) throw new Error('Use an email and a password of at least 8 characters.');
  const props = PropertiesService.getScriptProperties();
  const admins = JSON.parse(props.getProperty('ADMINS') || '{}');
  const salt = Utilities.getUuid();
  admins[email] = { salt: salt, hash: hash_(salt, password) };
  props.setProperty('ADMINS', JSON.stringify(admins));
  return email;
}
function setAdmin(){ Logger.log('Admin saved: ' + addAdmin(ADMIN_EMAIL, ADMIN_PASSWORD) + '. Now erase the password from the top of this file.'); }
function removeAdmin(){
  const props = PropertiesService.getScriptProperties(), admins = JSON.parse(props.getProperty('ADMINS') || '{}');
  delete admins[String(ADMIN_EMAIL).toLowerCase()];
  props.setProperty('ADMINS', JSON.stringify(admins));
  Logger.log('Removed ' + ADMIN_EMAIL);
}

/* ------------------------------------------------------------ automatic deletion of old records */
function trim_(name, col, days){
  const sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return;
  const cutoff = Date.now() - days * 86400000;
  const vals = sh.getRange(2, SCHEMA[name].indexOf(col) + 1, last - 1, 1).getValues();
  let n = 0;
  while (n < vals.length && ms_(vals[n][0]) < cutoff) n++;
  if (n > 0) sh.deleteRows(2, n);
}
function cleanup(){
  trim_('Tracks', 'ts', CFG.TRACK_RETAIN_DAYS);
  trim_('Shifts', 'startAt', CFG.RECORD_RETAIN_DAYS);
  trim_('Trips', 'startAt', CFG.RECORD_RETAIN_DAYS);
  trim_('Audit', 'at', CFG.AUDIT_RETAIN_DAYS);
}
function installDailyCleanup(){
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'cleanup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cleanup').timeBased().everyDays(1).atHour(2).create();
  Logger.log('Daily cleanup installed (runs around 2 AM).');
}
