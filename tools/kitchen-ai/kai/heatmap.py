"""Where people move in the kitchen (owner, 30 Oct 2026: "very necessary for our kitchen re-design
plan"). From the frames taken out of the recordings every 10 seconds: everyone's feet on the empty
kitchen picture as a heatmap (the whole day and hour by hour), the time spent in each zone, the
busiest moments in each, and the trips people make between zones - which pairs of stations are
walked between most, so they can be put next to each other."""
import html
import os
from collections import Counter, defaultdict
from datetime import datetime

import numpy as np
import cv2

from . import zones as zone_mod
from .track import Tracker

GRID = (192, 108)        # density grid (w, h): one cell = 10 x 10 pixels of a 1920 x 1080 picture
BLUR = 7                 # spreads each footstep over its neighbours (cells)
NEW_WALK_S = 60          # frames further apart than this start the following afresh
MIN_STAY = 2             # looks in a zone (20 s) before it counts as a stop there
ELSEWHERE = "Elsewhere"  # feet in no drawn zone


def samples(store, cam, dates, zs=None):
    """[(time, box, zone, top)] for everyone in the recorded frames of those days (not the bursts),
    placed in the zones as drawn now (zs) - frames looked at before the zones were drawn count too."""
    out = []
    for d in dates:
        for r in store.people_rows("f.cam = ? and f.source = 'rec' and substr(f.ts, 1, 10) = ?", (cam, d)):
            zone = zone_mod.zone_of(zs, (r["x1"] + r["x2"]) / 2, r["y2"]) if zs else r["zone"]
            out.append((datetime.fromisoformat(r["ts"]), (r["x1"], r["y1"], r["x2"], r["y2"]), zone or ELSEWHERE, r["top"]))
    out.sort(key=lambda x: x[0])
    return out


def density(points):
    """A 0-1 heat grid from feet positions (x, y as 0-1)."""
    g = np.zeros((GRID[1], GRID[0]), np.float32)
    for x, y in points:
        i, j = min(GRID[1] - 1, max(0, int(y * GRID[1]))), min(GRID[0] - 1, max(0, int(x * GRID[0])))
        g[i, j] += 1
    if g.max() > 0:
        g = cv2.GaussianBlur(g, (0, 0), BLUR)
        g /= g.max()
    return g


def overlay(picture, heat, zs=(), scale_w=1280):
    """The heat over the kitchen picture: transparent where nobody stood, red where most did."""
    h, w = picture.shape[:2]
    pic = cv2.resize(picture, (scale_w, round(h * scale_w / w)), interpolation=cv2.INTER_AREA)
    ph, pw = pic.shape[:2]
    big = cv2.resize(heat, (pw, ph), interpolation=cv2.INTER_CUBIC).clip(0, 1)
    colour = cv2.applyColorMap((big * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    alpha = (np.sqrt(big) * 0.75)[..., None]
    alpha[big < 0.04] = 0
    grey = cv2.cvtColor(cv2.cvtColor(pic, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    out = (grey * (1 - alpha) + colour * alpha).astype(np.uint8)
    for name, pts in zs:
        poly = (pts.astype(np.float32) / zone_mod.SCALE * [pw, ph]).astype(np.int32)
        cv2.polylines(out, [poly], True, (255, 255, 255), 2, cv2.LINE_AA)
        x, y = poly[:, 0].min() + 6, poly[:, 1].min() + 22
        cv2.putText(out, name, (int(x), int(y)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(out, name, (int(x), int(y)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def stops_and_trips(rows):
    """Follow people look to look; a stop is MIN_STAY or more looks in one zone. Returns the trips
    between stops (from zone, to zone) and the stops themselves (zone, seconds)."""
    # Looks are 10 s apart: someone can cross the room in that time, so a big step in the same top
    # colour is still the same person.
    follow = lambda: Tracker(min_iou=0.1, max_move=0.8, max_missed=6)  # noqa: E731
    tracker, last_t = follow(), None
    seqs = defaultdict(list)  # track -> [zone per look]
    by_time = defaultdict(list)
    for t, box, zone, top in rows:
        by_time[t].append((box, zone, top))
    walk = 0
    for t in sorted(by_time):
        if last_t is None or (t - last_t).total_seconds() > NEW_WALK_S:
            tracker, walk = follow(), walk + 1
        people = by_time[t]
        ids = tracker.update([b for b, _, _ in people], [tp for _, _, tp in people])
        for i, (_, zone, _) in zip(ids, people):
            seqs[(walk, i)].append(zone)
        last_t = t
    trips = Counter()
    for zs_ in seqs.values():
        runs = []
        for z in zs_:
            if runs and runs[-1][0] == z:
                runs[-1][1] += 1
            else:
                runs.append([z, 1])
        stays = [z for z, n in runs if n >= MIN_STAY]
        stays = [z for i, z in enumerate(stays) if i == 0 or z != stays[i - 1]]
        for a, b in zip(stays, stays[1:]):
            trips[(a, b)] += 1
    return trips


def summary(rows, step_s):
    """Person-minutes per zone, the most people in each zone at once (and when), per hour."""
    per_zone = Counter()
    per_hour = defaultdict(Counter)
    crowd = defaultdict(lambda: (0, None))
    by_time = defaultdict(Counter)
    for t, _, zone, _ in rows:
        per_zone[zone] += step_s / 60
        per_hour[t.hour][zone] += step_s / 60
        by_time[t][zone] += 1
    for t, c in by_time.items():
        for zone, n in c.items():
            if n > crowd[zone][0]:
                crowd[zone] = (n, t)
    return per_zone, per_hour, dict(crowd)


def build(store, cam, dates, picture_path, zones_dir, out_dir, step_s=10, title=None):
    """Writes heatmap-<dates>.html with its pictures into out_dir; returns its path (None: no data)."""
    zs = zone_mod.load(zones_dir, cam)
    rows = samples(store, cam, dates, zs)
    if not rows:
        return None
    picture = cv2.imread(picture_path)
    tag = dates[0] if len(dates) == 1 else f"{dates[0]}_to_{dates[-1]}"
    os.makedirs(out_dir, exist_ok=True)
    feet = lambda rs: [((b[0] + b[2]) / 2, b[3]) for _, b, _, _ in rs]  # noqa: E731
    day_png = f"heatmap-{tag}.jpg"
    cv2.imwrite(os.path.join(out_dir, day_png), overlay(picture, density(feet(rows)), zs), [cv2.IMWRITE_JPEG_QUALITY, 88])
    hours = sorted({t.hour for t, *_ in rows})
    hour_pngs = []
    for hr in hours:
        part = [r for r in rows if r[0].hour == hr]
        name = f"heatmap-{tag}-{hr:02d}.jpg"
        cv2.imwrite(os.path.join(out_dir, name), overlay(picture, density(feet(part)), zs, scale_w=640), [cv2.IMWRITE_JPEG_QUALITY, 82])
        hour_pngs.append((hr, name, len(part)))
    per_zone, per_hour, crowd = summary(rows, step_s)
    trips = stops_and_trips(rows)
    path = os.path.join(out_dir, f"heatmap-{tag}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(page(title or (f"Kitchen movement · {dates[0]}" if len(dates) == 1 else f"Kitchen movement · {dates[0]} to {dates[-1]}"),
                     cam, dates, day_png, hour_pngs, per_zone, per_hour, crowd, trips, step_s, len(rows)))
    return path


def page(title, cam, dates, day_png, hour_pngs, per_zone, per_hour, crowd, trips, step_s, n):
    esc = html.escape
    fmt = lambda m: f"{m / 60:.1f} h" if m >= 60 else (f"{m:.0f} min" if m >= 1 else "under 1 min")  # noqa: E731
    total = sum(per_zone.values()) or 1
    zone_rows = "".join(
        f"<tr><th>{esc(z)}</th><td>{fmt(m)}</td><td><span class=bar style='width:{100 * m / total:.0f}%'></span> {100 * m / total:.0f}%</td>"
        f"<td>{crowd[z][0]} at {crowd[z][1]:%H:%M}</td></tr>" for z, m in per_zone.most_common())
    trip_rows = "".join(f"<tr><td>{esc(a)} → {esc(b)}</td><td>{n_}</td></tr>" for (a, b), n_ in trips.most_common(15)) or "<tr><td>Not enough movement followed yet</td></tr>"
    zones_all = [z for z, _ in per_zone.most_common()]
    hour_head = "".join(f"<th>{esc(z)}</th>" for z in zones_all)
    hour_rows = "".join(f"<tr><th>{h:02d}:00</th>" + "".join(f"<td>{fmt(per_hour[h][z]) if per_hour[h][z] >= 1 else '-'}</td>" for z in zones_all) + "</tr>" for h in sorted(per_hour))
    thumbs = "".join(f"<figure><img src='{esc(p)}' alt='Heatmap {h:02d}:00 to {h + 1:02d}:00' loading=lazy><figcaption>{h:02d}:00–{h + 1:02d}:00 · {c} sightings</figcaption></figure>" for h, p, c in hour_pngs)
    return f"""<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{esc(title)}</title><style>
:root{{--bg:#fbfaf7;--card:#fff;--ink:#1d2421;--muted:#66706b;--line:#e3e0d8;--accent:#c4521f}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151817;--card:#1e2220;--ink:#eef0ee;--muted:#a3aba6;--line:#333a37}}}}
*{{box-sizing:border-box}} body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}}
main{{max-width:1100px;margin:auto}} h1{{font-size:24px;margin:0}} h2{{font-size:18px;margin:28px 0 8px}} p.sub{{color:var(--muted);margin:4px 0 16px}}
img{{width:100%;height:auto;border-radius:10px;display:block}} .big{{border:1px solid var(--line)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}} figure{{margin:0}} figcaption{{color:var(--muted);font-size:13px;margin-top:4px}}
.tbl{{overflow-x:auto}} table{{border-collapse:collapse;width:100%}} th,td{{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}}
.bar{{display:inline-block;height:10px;background:var(--accent);border-radius:3px;vertical-align:middle;max-width:160px}}
.key{{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;margin:8px 0}} .key i{{display:inline-block;width:160px;height:10px;border-radius:3px;background:linear-gradient(90deg,#30123b,#4686fb,#1be5b5,#a2fc3c,#fbb938,#e4460a,#7a0403)}}
</style></head><body><main>
<h1>{esc(title)}</h1>
<p class=sub>Camera {esc(cam)} · where people's feet were, from a frame every {step_s:.0f} seconds of the recordings ({n:,} sightings). For the kitchen redesign: the hot spots are where people spend their time; the trips are the walks a better layout could shorten.</p>
<img class=big src='{esc(day_png)}' alt='Heatmap of the whole day'>
<p class=key>few <i></i> most</p>
<h2>Time in each area</h2>
<div class=tbl><table><thead><tr><th>Area</th><th>People-time</th><th>Share</th><th>Most at once</th></tr></thead><tbody>{zone_rows}</tbody></table></div>
<h2>Walks between areas</h2>
<p class=sub>A walk counts when someone stops (20 s or more) in one area and next stops in another. Pairs walked between often belong next to each other.</p>
<div class=tbl><table><thead><tr><th>From → to</th><th>Times</th></tr></thead><tbody>{trip_rows}</tbody></table></div>
<h2>Hour by hour</h2>
<div class=grid>{thumbs}</div>
<div class=tbl><table><thead><tr><th>Hour</th>{hour_head}</tr></thead><tbody>{hour_rows}</tbody></table></div>
</main></body></html>"""
