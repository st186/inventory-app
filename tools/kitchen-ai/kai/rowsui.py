"""The video labelling page, on this PC only: http://localhost:8765/rows (`ka.py label`, the same page
server as the photo labels). Made for labelling with the people who work in the kitchen (owner, 30 Oct
2026): pick a day and a person; their moments run left to right, one small picture every 5 seconds.
Tap a picture to watch those 5 seconds; tap another with "Select to here" (or Shift) for a stretch;
then press what they were doing. The labeller's name is saved with every label.

Also: put a name to each person once, join two people who are one ("looks like Person 7"), move a
piece that is someone else, and the day's timeline - everyone in one picture."""
import json
import os
import re
from datetime import datetime, timedelta

import numpy as np
import cv2

from . import video
from .clips import clip_box
from .rows import BLOCK_S, RowsDB
from .store import ACTIVITIES, NOT_A_PERSON

LABELS = ACTIVITIES + [NOT_A_PERSON]
COLOURS = {"folding": "#c4521f", "machine": "#2f6fb0", "prep": "#2f7d4f", "filling": "#b38600", "cooking": "#8e44ad", "packing": "#0f8b8d",
           "cleaning": "#6b8e23", "phone": "#d6336c", "idle": "#8a8a8a", "other": "#a0522d", NOT_A_PERSON: "#222"}
LOOP_FPS = 4


class Ctx:
    """What the page needs: the rows of each day, and the recordings for the moving pictures."""

    def __init__(self, s, cam):
        self.folder = os.path.join(s.root, "rows")
        self.cam = cam
        self.recordings = s.recordings
        self._db, self._rec = {}, {}

    def days(self):
        return RowsDB.days(self.folder, self.cam)

    def db(self, date):
        if date not in self.days():
            return None
        if date not in self._db:
            self._db[date] = RowsDB(self.folder, self.cam, date)
        return self._db[date]

    def rec(self, date):
        if date not in self._rec or not self._rec[date]:
            self._rec[date] = video.pieces(self.recordings, self.cam, date)
        return self._rec[date]

    def names(self):
        out = set()
        for d in self.days():
            out.update(self.db(d).names())
        return sorted(out)

    def counts(self):
        tot = {}
        for d in self.days():
            for k, v in self.db(d).counts().items():
                tot[k] = tot.get(k, 0) + v
        return tot


def _jpg(img, q=82):
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])[1].tobytes()


def loop_strip(recs, date, boxes, t):
    """The person's 5 seconds from t as one picture strip (LOOP_FPS a second), cut like their clips."""
    boxes = [b for _, b in boxes]
    frames = video.read_span(recs, datetime.strptime(date, "%Y-%m-%d") + timedelta(seconds=t), BLOCK_S, 1 / LOOP_FPS)
    if not boxes or not frames:
        return None
    h, w = frames[0][1].shape[:2]
    x1, y1, x2, y2 = clip_box(boxes, w, h)
    return _jpg(np.hstack([cv2.resize(f[y1:y2, x1:x2], (240, 240), interpolation=cv2.INTER_AREA) for _, f in frames]))


def frame_with_box(recs, date, boxes):
    """The whole kitchen at the block's first box, with that box drawn."""
    if not boxes:
        return None
    bt, (x1, y1, x2, y2) = boxes[0]
    frames = video.read_span(recs, datetime.strptime(date, "%Y-%m-%d") + timedelta(seconds=bt), 0.1)
    if not frames:
        return None
    img = frames[0][1]
    h, w = img.shape[:2]
    cv2.rectangle(img, (int(x1 * w), int(y1 * h)), (int(x2 * w), int(y2 * h)), (31, 82, 196), max(3, w // 300))
    return _jpg(cv2.resize(img, (960, round(h * 960 / w)), interpolation=cv2.INTER_AREA))


ROUTE = re.compile(r"^/rows/(thumb|loop|frame)/(\d{4}-\d{2}-\d{2})/(\d+)/(\d+(?:\.\d+)?)$")


def get(h, u, q, ctx, lock):
    """GET routes; False when the path isn't the rows page's."""
    if u.path == "/rows":
        page = PAGE.replace("__LABELS__", json.dumps(LABELS)).replace("__COLOURS__", json.dumps(COLOURS)).replace("__BLOCK__", str(BLOCK_S))
        h._send(page.encode(), "text/html; charset=utf-8")
        return True
    m = ROUTE.match(u.path)
    if m:
        kind, date, piece, t = m[1], m[2], int(m[3]), float(m[4])
        with lock:  # the database under the lock; the video (slow) outside it, so the small pictures keep coming
            db = ctx.db(date)
            body = boxes = None
            if db is not None:
                if kind == "thumb":
                    body = db.thumb(piece, t)
                else:
                    boxes, recs = db.boxes(piece, t, t + BLOCK_S), ctx.rec(date)
        if boxes is not None:
            body = loop_strip(recs, date, boxes, t) if kind == "loop" else frame_with_box(recs, date, boxes)
        if body is None:
            h._json({"error": "not found"}, 404)
        else:
            h._send(body, "image/jpeg")
        return True
    if not u.path.startswith("/api/rows/"):
        return False
    what = u.path[len("/api/rows/"):]
    date = q.get("date", [""])[0]
    with lock:
        if what == "days":
            days = ctx.days()
            return h._json({"days": days, "names": ctx.names(), "counts": ctx.counts()}) or True
        db = ctx.db(date)
        if db is None:
            return h._json({"error": "no rows for that day yet"}, 404) or True
        if what == "people":
            return h._json({"people": db.persons(), "counts": db.counts()}) or True
        if what == "blocks":
            return h._json({"blocks": db.blocks(int(q.get("person", ["0"])[0]))}) or True
        if what == "timeline":
            return h._json({"people": db.timeline()}) or True
    h._json({"error": "not found"}, 404)
    return True


def post(h, path, body, ctx, lock):
    """POST routes; False when the path isn't the rows page's."""
    if not path.startswith("/api/rows/"):
        return False
    what = path[len("/api/rows/"):]
    with lock:
        db = ctx.db(str(body.get("date", "")))
        if db is None:
            return h._json({"error": "no rows for that day"}, 404) or True
        try:
            if what == "label":
                lab = body.get("label")
                if lab is not None and lab not in LABELS:
                    return h._json({"error": "unknown label"}, 400) or True
                by = str(body.get("by") or "").strip()[:40]
                if lab is not None and not by:
                    return h._json({"error": "who is labelling?"}, 400) or True
                items = [(int(i["piece"]), float(i["t"])) for i in body["items"]]
                db.set_labels(items, lab, by)
            elif what == "who":
                db.set_who(int(body["person"]), str(body.get("who") or "")[:60])
            elif what == "move":
                to = body.get("to")
                return h._json({"person": db.move_piece(int(body["piece"]), int(to) if to else None)}) or True
            elif what == "join":
                db.join(int(body["person"]), int(body["into"]))
            else:
                return h._json({"error": "not found"}, 404) or True
        except (KeyError, TypeError, ValueError):
            return h._json({"error": "bad request"}, 400) or True
    h._json({"ok": True})
    return True


PAGE = """<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Kitchen video labels</title><style>
:root{--bg:#f7f5f0;--card:#fff;--ink:#1d2421;--muted:#66706b;--line:#e3e0d8;--accent:#c4521f;--ok:#2f7d4f}
*{box-sizing:border-box} [hidden]{display:none!important} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
header{display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--card)}
header h1{font-size:18px;margin:0} header a{color:var(--accent)} .muted{color:var(--muted);font-size:13px}
input,select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:#fff;color:inherit}
button{font:inherit;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:inherit;cursor:pointer;min-height:40px}
button:focus-visible,.tile:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
button.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.tabs{display:flex;gap:6px}
main{display:grid;grid-template-columns:250px 1fr;gap:16px;padding:16px;max-width:1500px;margin:0 auto}
@media (max-width:820px){main{grid-template-columns:1fr}}
#list{display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 90px);overflow:auto}
#list details{display:flex;flex-direction:column;gap:8px} #list details .pc{margin-top:8px;width:100%} summary{cursor:pointer;padding:6px 2px}
@media (max-width:820px){#list{flex-direction:row;overflow-x:auto;max-height:none}}
.pc{display:flex;gap:10px;text-align:left;padding:8px;min-width:200px;align-items:center}
.pc img{width:44px;height:66px;object-fit:cover;border-radius:6px;background:#eee;flex:none}
.pc b{display:block} .bar{height:5px;background:#eee;border-radius:3px;overflow:hidden;margin-top:4px;width:120px} .bar i{display:block;height:100%;background:var(--ok)}
.pc.still{opacity:.55}
#view{min-width:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
#top{display:grid;grid-template-columns:200px 1fr;gap:12px;position:sticky;top:0;z-index:3}
@media (max-width:820px){#top{grid-template-columns:110px 1fr;position:static}}
#loop{width:100%;aspect-ratio:1;background:#eee;border-radius:8px;display:block}
#frame{width:100%;max-height:220px;object-fit:contain;background:#eee;border-radius:8px;display:block}
#when{font-weight:600;margin:6px 0 0}
.who{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.keys{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.keys button i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}
.keys kbd{font:600 12px ui-monospace,monospace;color:var(--muted);margin-right:4px}
.piece{margin-top:12px} .piece h3{font-size:14px;margin:0 0 8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:4px}
.tile{position:relative;padding:0;min-height:0;border:2px solid transparent;border-radius:6px;background:#eee;aspect-ratio:2/3;overflow:hidden}
.tile img{width:100%;height:100%;object-fit:cover;display:block}
.tile .lab{position:absolute;left:0;right:0;bottom:0;height:9px}
.tile .tm{position:absolute;top:0;left:0;font-size:10px;background:rgba(0,0,0,.55);color:#fff;padding:0 3px;border-bottom-right-radius:4px}
.tile.sel{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}
.lanes{position:relative} .lane{display:grid;grid-template-columns:130px 1fr;gap:8px;align-items:center;margin:6px 0}
.track{position:relative;height:22px;background:#f0eee8;border-radius:4px;overflow:hidden}
.track span{position:absolute;top:0;bottom:0}
.ticks{position:relative;height:18px;margin-left:138px;font-size:11px;color:var(--muted)} .ticks span{position:absolute;transform:translateX(-50%)}
.legend{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin:8px 0} .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px}
#flash{position:fixed;right:16px;bottom:16px;background:var(--ok);color:#fff;padding:8px 12px;border-radius:8px;opacity:0;transition:opacity .2s}
#flash.err{background:#b3261e}
</style></head><body>
<header><h1>Kitchen video labels</h1>
<label>Day <select id=day></select></label>
<label>Labelling: <input id=by list=names placeholder="Your name" size=12></label>
<div class=tabs><button id=tabLabel class=on>Label</button><button id=tabDay>Day timeline</button></div>
<span class=muted id=counts></span><a href="/">Photo labels</a></header>
<datalist id=names></datalist>
<main id=labelView><div id=list aria-label="People in the day"></div>
<div id=view><p class=muted id=empty>Pick a person on the left.</p></div></main>
<main id=dayView hidden style="grid-template-columns:1fr"><div class=card><div class=legend id=legend></div><div class=ticks id=ticks></div><div class=lanes id=lanes></div></div></main>
<div id=flash role=status aria-live=polite></div>
<script>
const LABELS = __LABELS__, COLOURS = __COLOURS__, BLOCK = __BLOCK__, SHORT = 60;
const SHOWN = {folding: 'folding momos', machine: 'machine / dough', prep: 'cutting veg (prep)', filling: 'making filling', cooking: 'steaming / frying',
  packing: 'packing', cleaning: 'cleaning', phone: 'phone', idle: 'idle', other: 'other / walking', 'not-a-person': 'not a person'};
const KEYS = {}; LABELS.slice(0, 9).forEach((l, i) => KEYS[String(i + 1)] = l); KEYS.o = 'other'; KEYS['0'] = 'not-a-person';
const KEY_OF = Object.fromEntries(Object.entries(KEYS).map(([k, l]) => [l, k]));
const $ = (id) => document.getElementById(id);
let date = null, people = [], cur = null, blocks = [], sel = null, anchor = null, rangeMode = false, timer = null;
const hhmm = (t) => { t = Math.floor(t); return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t % 3600 / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const mins = (s) => s < 60 ? `${Math.round(s)} s` : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : `${Math.round(s / 60)} min`;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nameOf = (p) => p.who ? esc(p.who) : `Person ${p.id}`;
function flash(t, err) { const f = $('flash'); f.textContent = t; f.className = err ? 'err' : ''; f.style.opacity = 1; clearTimeout(f._t); f._t = setTimeout(() => f.style.opacity = 0, 1200); }
async function api(path, body) {
  const r = await fetch(path, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({date, ...body})} : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
}
try { $('by').value = localStorage.getItem('kai-by') || ''; } catch (e) {}
$('by').onchange = () => { try { localStorage.setItem('kai-by', $('by').value.trim()); } catch (e) {} };

async function loadDays() {
  const r = await api('/api/rows/days');
  $('day').innerHTML = r.days.map((d) => `<option>${d}</option>`).join('') || '<option value="">no day yet</option>';
  $('names').innerHTML = r.names.map((n) => `<option value="${esc(n)}">`).join('');
  showCounts(r.counts, 'all days');
  // #2026-10-30/6 opens that day and person (#2026-10-30/day: the day's timeline) - the address keeps your place
  const [hd, hp] = decodeURIComponent(location.hash.slice(1)).split('/');
  date = r.days.includes(hd) ? hd : r.days[r.days.length - 1] || null; $('day').value = date || '';
  if (date) await loadPeople();
  if (hp === 'day') $('tabDay').click(); else if (+hp) await openPerson(+hp);
}
function showCounts(c, where) {
  const parts = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${SHOWN[l] || l} ${mins(n * BLOCK)}`);
  $('counts').textContent = parts.length ? `Labelled (${where}): ${parts.join(' · ')}` : 'Nothing labelled yet';
}
async function loadPeople(keep) {
  const r = await api(`/api/rows/people?date=${date}`);
  people = r.people;
  $('list').innerHTML = '';
  // Under a minute and not named or labelled: mostly an arm, someone passing the door or a thing taken
  // for a person (30 Oct 13:51-14:21 had 32 "people" for 3-4 workers) - folded away below the rest.
  const big = (p) => p.seen >= SHORT || p.who || p.labelled;
  const short = people.filter((p) => !big(p));
  let into = $('list');
  for (const p of [...people.filter(big), ...short]) {
    if (p === short[0]) {
      const d = document.createElement('details'); d.innerHTML = `<summary class=muted>${short.length} short pieces (under a minute: arms, people passing, things taken for people)</summary>`;
      $('list').appendChild(d); into = d;
    }
    const b = document.createElement('button'); b.className = 'pc' + (p.still ? ' still' : '') + (cur && cur.id === p.id ? ' on' : ''); b.dataset.id = p.id;
    const pct = p.blocks ? Math.round(100 * p.labelled / p.blocks) : 0;
    b.innerHTML = `<img alt="" loading=lazy src="/rows/thumb/${date}/${p.cover.piece}/${p.cover.t}"><span><b>${nameOf(p)}</b><span class=muted>${hhmm(p.first).slice(0, 5)}–${hhmm(p.last).slice(0, 5)} · ${mins(p.seen)}${p.still ? ' · probably not a person' : ''}</span><span class=bar><i style="width:${pct}%"></i></span></span>`;
    b.onclick = () => openPerson(p.id); into.appendChild(b);
  }
  if (keep && cur) { const p = people.find((x) => x.id === cur.id); if (p) return openPerson(p.id, true); }
  if (!people.length) $('view').innerHTML = '<p class=muted>No one followed on this day yet.</p>';
}
async function openPerson(id, keepSel) {
  cur = people.find((p) => p.id === id); if (!cur) return;
  history.replaceState(null, '', `#${date}/${id}`);
  for (const b of $('list').querySelectorAll('.pc')) b.classList.toggle('on', +b.dataset.id === id);
  blocks = (await api(`/api/rows/blocks?date=${date}&person=${id}`)).blocks;
  if (!keepSel) { sel = null; anchor = null; }
  render();
  if (!keepSel) { const first = blocks.findIndex((b) => !b.label); select(first < 0 ? 0 : first); }
}
function render() {
  const v = $('view'); const p = cur;
  const others = people.filter((q) => q.id !== p.id);
  v.innerHTML = `<div id=top class=card><div><canvas id=loop width=240 height=240 aria-label="The 5 seconds, playing"></canvas><p id=when></p></div>
    <div><div class=who><label>Who is this? <input id=who list=names value="${esc(p.who || '')}" placeholder="Name"></label>
    ${p.alike.map((a) => `<button data-join=${a.id}>Same person as ${a.who ? esc(a.who) : 'Person ' + a.id}? Join</button>`).join('')}</div>
    <img id=frame alt="Where they are in the kitchen (box)">
    <div class=keys>${LABELS.map((l) => `<button data-label="${l}"><kbd>${KEY_OF[l] || ''}</kbd><i style="background:${COLOURS[l]}"></i>${SHOWN[l] || l}</button>`).join('')}
    <button id=clear><kbd>Del</kbd>clear</button><button id=range>Select to here: off</button></div></div></div>`;
  const byPiece = {};
  blocks.forEach((b, i) => (byPiece[b.piece] = byPiece[b.piece] || []).push(i));
  for (const pc of p.pieces) {
    const idx = byPiece[pc.id] || []; if (!idx.length) continue;
    const d = document.createElement('div'); d.className = 'piece card';
    d.innerHTML = `<h3>${hhmm(pc.start)}–${hhmm(pc.end)} <span class=muted>${mins(pc.end - pc.start)}${pc.still ? ' · never moves: probably not a person' : ''}</span>
      <label class=muted>Not ${nameOf(p)}? <select data-move=${pc.id}><option value="">move to…</option><option value=new>a new person</option>${others.map((q) => `<option value=${q.id}>${nameOf(q)}</option>`).join('')}</select></label></h3><div class=tiles></div>`;
    const tiles = d.querySelector('.tiles');
    for (const i of idx) {
      const b = blocks[i]; const t = document.createElement('button'); t.className = 'tile'; t.dataset.i = i;
      t.title = `${hhmm(b.t)}${b.label ? ' · ' + (SHOWN[b.label] || b.label) + (b.by ? ' (' + esc(b.by) + ')' : '') : ''}`;
      t.innerHTML = `<img alt="" loading=lazy src="/rows/thumb/${date}/${b.piece}/${b.t}"><span class=tm>${hhmm(b.t).slice(0, 5)}</span><span class=lab style="background:${b.label ? COLOURS[b.label] : 'transparent'}"></span>`;
      t.onclick = (e) => select(i, e.shiftKey || rangeMode);
      tiles.appendChild(t);
    }
    v.appendChild(d);
  }
  $('who').onchange = async () => { await api('/api/rows/who', {person: p.id, who: $('who').value}); flash('Name saved'); await loadPeople(true); };
  v.querySelectorAll('[data-join]').forEach((b) => b.onclick = async () => { await api('/api/rows/join', {person: p.id, into: +b.dataset.join}); cur = {id: +b.dataset.join}; flash('Joined'); await loadPeople(true); });
  v.querySelectorAll('[data-move]').forEach((s) => s.onchange = async () => { if (!s.value) return; await api('/api/rows/move', {piece: +s.dataset.move, to: s.value === 'new' ? null : +s.value}); flash('Moved'); await loadPeople(true); });
  v.querySelectorAll('[data-label]').forEach((b) => b.onclick = () => label(b.dataset.label));
  $('clear').onclick = () => label(null);
  $('range').onclick = () => { rangeMode = !rangeMode; $('range').classList.toggle('on', rangeMode); $('range').textContent = `Select to here: ${rangeMode ? 'on' : 'off'}`; };
  paintSel();
}
function selected() { if (sel == null) return []; const [a, b] = anchor == null ? [sel, sel] : [Math.min(anchor, sel), Math.max(anchor, sel)]; const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }
function paintSel() { const s = new Set(selected()); document.querySelectorAll('.tile').forEach((t) => t.classList.toggle('sel', s.has(+t.dataset.i))); }
function select(i, extend) {
  if (i < 0 || i >= blocks.length) return;
  if (extend && sel != null) { if (anchor == null) anchor = sel; } else anchor = null;
  sel = i; paintSel();
  const t = document.querySelector(`.tile[data-i="${i}"]`); if (t) t.scrollIntoView({block: 'nearest'});
  play(blocks[i]);
}
function play(b) {
  clearInterval(timer); $('when').textContent = `${hhmm(b.t)}${b.label ? ' · ' + (SHOWN[b.label] || b.label) : ''}`;
  $('frame').src = `/rows/frame/${date}/${b.piece}/${b.t}`;
  const img = new Image(); const c = $('loop').getContext('2d'); c.clearRect(0, 0, 240, 240);
  img.onload = () => { const n = Math.max(1, Math.round(img.width / 240)); let k = 0;
    const draw = () => { c.drawImage(img, k * 240, 0, 240, 240, 0, 0, 240, 240); k = (k + 1) % n; };
    draw(); timer = setInterval(draw, 250); };
  img.src = `/rows/loop/${date}/${b.piece}/${b.t}`;
}
async function label(l) {
  const idx = selected(); if (!idx.length) return;
  const by = $('by').value.trim();
  if (l && !by) { $('by').focus(); return flash('Type your name first (Labelling:)', true); }
  try { await api('/api/rows/label', {items: idx.map((i) => ({piece: blocks[i].piece, t: blocks[i].t})), label: l, by}); }
  catch (e) { return flash(e.message, true); }
  for (const i of idx) { blocks[i].label = l; blocks[i].by = by; const t = document.querySelector(`.tile[data-i="${i}"] .lab`); if (t) t.style.background = l ? COLOURS[l] : 'transparent'; }
  flash(l ? `Saved: ${SHOWN[l] || l} × ${idx.length}` : 'Cleared');
  api('/api/rows/days').then((r) => showCounts(r.counts, 'all days')).catch(() => {});
  const next = idx[idx.length - 1] + 1; anchor = null; if (next < blocks.length) select(next); else paintSel();
  cur.labelled = blocks.filter((b) => b.label).length;
}
async function loadDay() {
  const r = await api(`/api/rows/timeline?date=${date}`);
  const all = r.people.flatMap((p) => p.spans); if (!all.length) { $('lanes').innerHTML = '<p class=muted>No one followed on this day yet.</p>'; return; }
  const lo = Math.min(...all.map((s) => s[0])), hi = Math.max(...all.map((s) => s[1]));
  const step = hi - lo > 3 * 3600 ? 3600 : 900;  // hours for a day, quarter hours for a short stretch
  const t0 = Math.floor(lo / step) * step, t1 = Math.ceil(hi / step) * step;
  const pos = (t) => `${(100 * (t - t0) / (t1 - t0)).toFixed(3)}%`;
  $('legend').innerHTML = LABELS.map((l) => `<span><i style="background:${COLOURS[l]}"></i>${SHOWN[l]}</span>`).join('') + '<span><i style="background:#cfcabd"></i>seen, not labelled yet</span>';
  let ticks = ''; for (let t = t0; t <= t1; t += step) ticks += `<span style="left:${pos(t)}">${hhmm(t).slice(0, 5)}</span>`; $('ticks').innerHTML = ticks;
  const seen = Object.fromEntries(people.map((p) => [p.id, p.seen]));
  const groups = {}; for (const p of r.people) {
    const labelled = p.spans.some((s) => s[2]);
    const k = p.who || labelled || (seen[p.id] || 0) >= SHORT ? nameOf(p) : 'Short pieces'; (groups[k] = groups[k] || []).push(...p.spans); }
  $('lanes').innerHTML = Object.entries(groups).map(([k, spans]) => `<div class=lane><b>${k}</b><div class=track>${spans.map((s) =>
    `<span title="${hhmm(s[0])}–${hhmm(s[1])} ${s[2] ? SHOWN[s[2]] : ''}" style="left:${pos(s[0])};width:${pos(t0 + s[1] - s[0])};background:${s[2] ? COLOURS[s[2]] : '#cfcabd'}"></span>`).join('')}</div></div>`).join('');
}
$('day').onchange = async () => { date = $('day').value; cur = null; $('view').innerHTML = ''; await loadPeople(); if (!$('dayView').hidden) loadDay(); };
$('tabLabel').onclick = () => { $('labelView').hidden = false; $('dayView').hidden = true; $('tabLabel').classList.add('on'); $('tabDay').classList.remove('on'); };
$('tabDay').onclick = () => { $('labelView').hidden = true; $('dayView').hidden = false; $('tabDay').classList.add('on'); $('tabLabel').classList.remove('on'); loadDay(); };
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || !cur) return;
  if (KEYS[e.key]) { e.preventDefault(); label(KEYS[e.key]); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); label(null); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); select(sel == null ? 0 : sel + 1, e.shiftKey); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); select(sel == null ? 0 : sel - 1, e.shiftKey); }
});
loadDays().catch((e) => flash(e.message, true));
</script></body></html>"""
