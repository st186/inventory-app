"""The labelling page, on this PC only: http://localhost:8765 (`ka.py label`). One person at a time, big:
press a number for what they're doing (o = other), Enter to agree with the suggestion, 0 for a box that isn't a
person, Backspace to go back. A few hundred checked labels are worth more than thousands of Bunny's."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import cv2

from .store import ACTIVITIES, NOT_A_PERSON

KEYS = {str(i + 1): a for i, a in enumerate(ACTIVITIES[:9])}  # 1-9; o = other, 0 = not a person
KEYS["o"] = "other"
KEYS["0"] = NOT_A_PERSON
# What the buttons say (the same meanings Bunny is given for its burst readings).
SHOWN = {"folding": "folding momos", "machine": "machine / dough", "prep": "cutting veg (prep)", "filling": "making filling", "cooking": "steaming / frying",
         "packing": "packing", "cleaning": "cleaning", "phone": "phone", "idle": "idle", "other": "other / walking", NOT_A_PERSON: "not a person"}

PAGE = """<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Kitchen labels</title><style>
:root{--bg:#f7f5f0;--card:#fff;--ink:#1d2421;--muted:#66706b;--line:#e3e0d8;--accent:#c4521f;--ok:#2f7d4f}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
header{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card)}
header h1{font-size:18px;margin:0 8px 0 0} #stats{color:var(--muted);font-size:14px}
select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line)}
main{max-width:1100px;margin:16px auto;padding:0 16px;display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:16px}
@media (max-width:760px){main{grid-template-columns:1fr}}
.pane{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
#crop{width:100%;height:420px;object-fit:contain;background:#eee;border-radius:8px}
#frame{width:100%;border-radius:8px;background:#eee;aspect-ratio:16/9;object-fit:contain}
.info{margin:10px 0 0;color:var(--muted);font-size:14px} .info b{color:var(--ink)}
.sugg{font-size:17px;margin:8px 0} .sugg b{color:var(--accent)}
.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:12px}
button{font:inherit;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--card);cursor:pointer;text-align:left;min-height:44px}
button kbd{display:inline-block;min-width:20px;font:600 13px ui-monospace,monospace;color:var(--muted)}
button.hint{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px} #done{display:none;padding:40px;text-align:center;color:var(--muted)}
#flash{position:fixed;right:16px;bottom:16px;background:var(--ok);color:#fff;padding:8px 12px;border-radius:8px;opacity:0;transition:opacity .2s}
</style></head><body>
<header><h1>Kitchen labels</h1>
<label>Show <select id=mode><option value=check>Bunny's labels to check</option><option value=new>People with no label</option><option value=unsure>The model's least sure</option></select></label>
<span id=stats></span></header>
<div id=done>Nothing left here. Pick another list above, or come back after the next day is added.</div>
<main id=work><div class=pane><img id=crop alt="The person to label"></div>
<div class=pane><img id=frame alt="Where they are in the kitchen (box)">
<p class=info id=info></p><p class=sugg id=sugg></p>
<div class=keys id=keys></div>
<div class=row><button id=accept><kbd>Enter</kbd> agree with the suggestion</button><button id=skip><kbd>&rarr;</kbd> skip</button><button id=undo><kbd>&larr;</kbd> back</button></div>
</div></main><div id=flash role=status aria-live=polite></div>
<script>
const KEYS = __KEYS__, SHOWN = __SHOWN__;
let queue = [], cur = null, seen = new Set(), history = [];
const $ = (id) => document.getElementById(id);
const keysEl = $('keys');
for (const [k, a] of Object.entries(KEYS)) {
  const b = document.createElement('button'); b.dataset.label = a;
  b.innerHTML = `<kbd>${k}</kbd> ${SHOWN[a] || a}`;
  b.onclick = () => label(a); keysEl.appendChild(b);
}
async function stats() {
  const s = await (await fetch('/api/stats')).json();
  $('stats').textContent = `Yours: ${s.yours} · Bunny's: ${s.bunny} · people found: ${s.people}`;
}
async function fill() {
  const r = await (await fetch(`/api/next?mode=${$('mode').value}&n=40`)).json();
  for (const x of r.items) if (!seen.has(x.id)) { queue.push(x); seen.add(x.id); }
}
function hint() { return cur ? ($('mode').value === 'check' ? (cur.ai || cur.pred) : (cur.pred || cur.ai)) : null; }
async function show() {
  if (queue.length < 5) await fill();
  cur = queue.shift() || null;
  $('done').style.display = cur ? 'none' : 'block'; $('work').style.display = cur ? '' : 'none';
  if (!cur) return;
  $('crop').src = `/img/crop/${cur.id}`; $('frame').src = `/img/frame/${cur.id}`;
  $('info').innerHTML = `<b>${cur.ts.replace('T', ' ')}</b> · ${cur.zone || 'no zone'} · top ${cur.top}${cur.phone ? ' · phone seen' : ''}${cur.moving != null ? ` · moving ${(cur.moving * 100).toFixed(0)}%` : ''}`;
  const parts = [];
  if (cur.ai) parts.push(`Bunny says <b>${cur.ai}</b>`);
  if (cur.pred) parts.push(`model guesses <b>${cur.pred}</b> (${Math.round(cur.pred_p * 100)}%)`);
  $('sugg').innerHTML = parts.join(' · ') || 'No suggestion yet';
  const h = hint();
  for (const b of keysEl.children) b.classList.toggle('hint', b.dataset.label === h);
}
async function label(a) {
  if (!cur || !a) return;
  await fetch('/api/label', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: cur.id, label: a})});
  history.push(cur); flash(a); stats(); show();
}
async function undo() {
  const last = history.pop(); if (!last) return;
  await fetch('/api/label', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: last.id, label: null})});
  if (cur) queue.unshift(cur); queue.unshift(last); stats(); show();
}
function flash(t) { const f = $('flash'); f.textContent = `Saved: ${t}`; f.style.opacity = 1; clearTimeout(f._t); f._t = setTimeout(() => f.style.opacity = 0, 700); }
$('accept').onclick = () => label(hint()); $('skip').onclick = () => show(); $('undo').onclick = undo;
$('mode').onchange = () => { queue = []; show(); };
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (KEYS[e.key]) { e.preventDefault(); label(KEYS[e.key]); }
  else if (e.key === 'Enter') { e.preventDefault(); label(hint()); }
  else if (e.key === 'ArrowRight') show();
  else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); undo(); }
});
stats(); show();
</script></body></html>"""


def make_handler(store, lock):
    page = PAGE.replace("__KEYS__", json.dumps(KEYS)).replace("__SHOWN__", json.dumps(SHOWN)).encode()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, body, ctype="application/json", code=200):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(json.dumps(obj).encode(), code=code)

        def do_GET(self):
            u = urlparse(self.path)
            q = parse_qs(u.query)
            if u.path == "/":
                return self._send(page, "text/html; charset=utf-8")
            if u.path == "/api/stats":
                with lock:
                    return self._json(store.stats())
            if u.path == "/api/next":
                with lock:
                    rows = store.queue(q.get("mode", ["check"])[0], int(q.get("n", ["30"])[0]))
                items = [{"id": r["id"], "ts": r["ts"], "zone": r["zone"], "top": r["top"], "phone": bool(r["phone"]), "moving": r["moving"],
                          "ai": r["ai"], "pred": r["pred"], "pred_p": r["pred_p"]} for r in rows]
                return self._json({"items": items})
            if u.path.startswith("/img/"):
                parts = u.path.split("/")
                if len(parts) != 4 or not parts[3].isdigit():
                    return self._json({"error": "not found"}, 404)
                with lock:
                    rows = store.people_rows("p.id = ?", (int(parts[3]),))
                if not rows:
                    return self._json({"error": "not found"}, 404)
                r = rows[0]
                if parts[2] == "crop" and r["crop"]:
                    with open(os.path.join(store.folder, r["crop"]), "rb") as f:
                        return self._send(f.read(), "image/jpeg")
                if parts[2] == "frame" and r["image"]:
                    img = cv2.imread(os.path.join(store.folder, r["image"]))
                    if img is not None:
                        h, w = img.shape[:2]
                        cv2.rectangle(img, (int(r["x1"] * w), int(r["y1"] * h)), (int(r["x2"] * w), int(r["y2"] * h)), (31, 82, 196), 3)
                        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        if ok:
                            return self._send(jpg.tobytes(), "image/jpeg")
                return self._json({"error": "not found"}, 404)
            return self._json({"error": "not found"}, 404)

        def do_POST(self):
            if urlparse(self.path).path != "/api/label":
                return self._json({"error": "not found"}, 404)
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                pid, lab = int(body["id"]), body.get("label")
            except (ValueError, KeyError, TypeError):
                return self._json({"error": "send id and label"}, 400)
            if lab is not None and lab not in ACTIVITIES and lab != NOT_A_PERSON:
                return self._json({"error": "unknown label"}, 400)
            with lock:
                store.set_owner(pid, lab)
            return self._json({"ok": True})

    return Handler


def serve(store, port=8765, open_browser=True):
    lock = threading.Lock()
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(store, lock))
    url = f"http://localhost:{port}"
    print(f"Labelling page: {url}  (Ctrl+C to stop)")
    if open_browser:
        import webbrowser
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return server
