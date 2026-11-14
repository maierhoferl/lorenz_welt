// Lorenz' Welt – Spielstand-Server (Cloudflare Worker + D1)
// Tabelle: kv(k TEXT PRIMARY KEY, v TEXT) – Schlüssel: profiles, save:<id>, fail:<id>, rq:<id>, rec:<id>
// Requests kommen als text/plain-JSON (kein CORS-Preflight, funktioniert auch mit keepalive beim Schließen).

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'content-type': 'application/json' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: CORS });
const DEFAULT = [{ id: 'lorenz', name: 'Lorenz', age: 9 }, { id: 'adrian', name: 'Adrian', age: 7 }];
const MAX_FAILS = 5, LOCK_MS = 2 * 60e3, TTL = 10 * 60e3, MAX_SAVE = 300e3, MAX_PROFILES = 30;

const get = async (db, k) => { const r = await db.prepare('SELECT v FROM kv WHERE k=?').bind(k).first(); return r ? JSON.parse(r.v) : null; };
const put = (db, k, v) => db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, JSON.stringify(v)).run();
const del = (db, k) => db.prepare('DELETE FROM kv WHERE k=?').bind(k).run();

// Rechenaufgaben zur Code-Wiederherstellung, Schwierigkeit nach Alter
export function problems(age) {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const L = [];
  if (age <= 8) {
    let x = r(27, 89), y = r(15, 69); L.push([`${x} + ${y}`, x + y]);
    x = r(52, 99); y = r(17, x - 10); L.push([`${x} − ${y}`, x - y]);
    x = r(6, 9); y = r(6, 9); L.push([`${x} × ${y}`, x * y]);
    x = r(3, 9); L.push([`${x * 7} : 7`, x]);
  } else {
    let x = r(13, 39), y = r(4, 9); L.push([`${x} × ${y}`, x * y]);
    y = r(6, 12); x = r(12, 25); L.push([`${x * y} : ${y}`, x]);
    x = r(234, 689); y = r(178, 299); L.push([`${x} + ${y}`, x + y]);
    x = r(501, 900); y = r(167, 489); L.push([`${x} − ${y}`, x - y]);
  }
  return L;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const path = new URL(req.url).pathname, db = env.DB, now = Date.now();
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const profiles = (await get(db, 'profiles')) || DEFAULT;

    if (path === '/profiles' && req.method === 'GET')
      return json(profiles.map(({ pinHash, ...p }) => ({ ...p, hasPin: !!pinHash })));

    if (path === '/profiles') {
      const name = String(body.name || '').trim().slice(0, 14), age = Math.min(16, Math.max(5, body.age | 0));
      if (!name) return json({ error: 'name' }, 400);
      if (profiles.length >= MAX_PROFILES) return json({ error: 'full' }, 400);
      const p = { id: 'p' + now.toString(36) + Math.random().toString(36).slice(2, 6), name, age };
      profiles.push(p); await put(db, 'profiles', profiles);
      return json({ ...p, hasPin: false });
    }

    const prof = profiles.find(p => p.id === body.id);
    if (!prof) return json({ error: 'unknown' }, 404);
    const pinValid = typeof body.pin === 'string' && /^[0-9a-fx-]{6,64}$/.test(body.pin);

    if (path === '/setpin') {
      if (!pinValid) return json({ error: 'pin' }, 400);
      if (prof.pinHash) { // Code ändern nur mit Token aus der Rechen-Wiederherstellung
        const rec = await get(db, 'rec:' + prof.id);
        if (!rec || rec.token !== body.token || rec.until < now) return json({ error: 'forbidden' }, 403);
        await del(db, 'rec:' + prof.id);
      }
      prof.pinHash = body.pin; await put(db, 'profiles', profiles);
      await del(db, 'fail:' + prof.id);
      return json({ ok: true });
    }
    if (path === '/recover/start') {
      const L = problems(prof.age);
      await put(db, 'rq:' + prof.id, { a: L.map(x => x[1]), until: now + TTL });
      return json({ problems: L.map(x => x[0]) });
    }
    if (path === '/recover/finish') {
      const rq = await get(db, 'rq:' + prof.id);
      await del(db, 'rq:' + prof.id); // jeder Versuch braucht neue Aufgaben
      const ans = Array.isArray(body.answers) ? body.answers : [];
      if (!rq || rq.until < now || rq.a.some((a, i) => String(ans[i] ?? '').trim() === '' || +ans[i] !== a)) return json({ error: 'wrong' }, 403);
      const token = crypto.randomUUID();
      await put(db, 'rec:' + prof.id, { token, until: now + TTL });
      return json({ token });
    }

    // ab hier ist der Code nötig
    const fail = (await get(db, 'fail:' + prof.id)) || { n: 0, until: 0 };
    if (fail.until > now) return json({ error: 'locked', wait: Math.ceil((fail.until - now) / 1000) }, 429);
    if (!prof.pinHash) return json({ error: 'nopin' }, 403);
    if (body.pin !== prof.pinHash) {
      if (++fail.n >= MAX_FAILS) { fail.n = 0; fail.until = now + LOCK_MS; }
      await put(db, 'fail:' + prof.id, fail);
      return json({ error: fail.until > now ? 'locked' : 'wrong', wait: LOCK_MS / 1000 }, 403);
    }
    if (fail.n) await del(db, 'fail:' + prof.id);

    if (path === '/login') return json({ save: await get(db, 'save:' + prof.id) });
    if (path === '/save') {
      if (!body.save || typeof body.save !== 'object' || JSON.stringify(body.save).length > MAX_SAVE) return json({ error: 'save' }, 400);
      await put(db, 'save:' + prof.id, body.save);
      return json({ ok: true });
    }
    return json({ error: 'notfound' }, 404);
  },
};
