"""The work itself: taking frames from the recordings, attaching Bunny's burst labels, judging a whole
day with the trained model (side by side with Bunny's bursts), and watching the kitchen live."""
import csv
import html
import os
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta

import numpy as np
import cv2

from . import bursts, learn, video
from .store import ACTIVITIES
from .track import Tracker

BURST_MINUTES_PER_FRAME = 1.75  # a burst every 35 minutes, 20 frames: what each burst frame stands for


def _key(ts):
    return ts.isoformat(timespec="seconds")


def person_row(p):
    """A Person in the shape the model's features expect."""
    x1, y1, x2, y2 = p.box
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "motion": p.motion, "moving": p.moving, "phone": p.phone, "zone": p.zone, "feat": p.feat}


def harvest(s, store, looker, cam, date, say=print):
    """Every step_sec seconds of a recorded day into the dataset (frames already there are skipped)."""
    found = done = 0
    for piece in video.pieces(s.recordings, cam, date):
        if store.piece_done(piece.path):
            continue
        t0 = time.time()
        for ts, frame, later in video.sample(piece, s.step_sec):
            if store.has_frame(cam, _key(ts), "rec"):
                continue
            frame, people = looker.look(frame, later)
            store.add_frame(cam, _key(ts), "rec", frame, people)
            found += len(people)
            done += 1
        store.mark_piece(piece.path)
        say(f"  {os.path.basename(piece.path)}: done in {time.time() - t0:.0f} s")
    say(f"{date}: {done} frames looked at, {found} people found")
    return done, found


def prelabel(s, store, looker, cam, date=None, say=print):
    """Bunny's burst readings onto the people the finder sees in the same frames. Where the recording
    has that moment, its frame is used (the same picture quality as the rest of the dataset, and a
    second frame for movement); otherwise the burst's own frame."""
    labelled = frames = 0
    day_pieces = {}
    for folder in bursts.burst_folders(s.bursts, cam, date):
        look = bursts.read(folder)
        if not look.get("people"):
            continue  # kept before the server sent its reading back
        for i, name in enumerate(look["frames"]):
            if i >= len(look["times"]):
                break
            ts = look["times"][i]
            if store.has_frame(cam, ts, "burst"):
                continue
            when = datetime.fromisoformat(ts)
            d = ts[:10]
            if d not in day_pieces:
                day_pieces[d] = video.pieces(s.recordings, cam, d)
            frame, later = video.frame_at(day_pieces[d], when)
            if frame is None:
                frame = cv2.imread(os.path.join(folder, name))
                if frame is None:
                    continue
            frame, people = looker.look(frame, later)
            ids = store.add_frame(cam, ts, "burst", frame, people)
            seen = bursts.frame_labels(look, i)
            pairs = bursts.match([x[1] for x in seen], [((p.box[0] + p.box[2]) / 2, p.top) for p in people])
            for b, a in pairs.items():
                act = seen[a][2] if seen[a][2] in ACTIVITIES else "other"
                store.set_ai(ids[b], act, seen[a][3])
                labelled += 1
            frames += 1
    say(f"Bunny's labels: {labelled} people in {frames} burst frames")
    return labelled


def predict_all(store, model, say=print):
    """The model's guess for everyone in the dataset (the labelling page shows it, and asks about the
    ones it is least sure of)."""
    rows = store.people_rows()
    if not rows:
        return 0
    P = model.proba(learn.features(rows, model.spec, store.feat))
    store.save_preds(model.name, [(r["id"], ACTIVITIES[int(P[i].argmax())], P[i].max()) for i, r in enumerate(rows)])
    say(f"guesses saved for {len(rows)} people")
    return len(rows)


def judge(looker, model, frame, later, tracker):
    """One look, judged: [(track, person, activity, how sure)]."""
    frame, people = looker.look(frame, later)
    if not people:
        tracker.update([], [])
        return []
    P = model.proba(learn.features([person_row(p) for p in people], model.spec, lambda r: r["feat"]))
    ids = tracker.update([p.box for p in people], [p.top for p in people])
    return [(ids[i], p, ACTIVITIES[int(P[i].argmax())], float(P[i].max())) for i, p in enumerate(people)]


def day(s, looker, model, cam, date, say=print):
    """A recorded day judged every step_sec seconds: minutes per person (by top colour) per activity,
    next to what Bunny's bursts made of the same day. Writes <root>\\activity\\<cam>\\<date>.csv and
    <root>\\reports\\<cam>-<date>.html; returns the report's path."""
    tracker = Tracker()
    looks = []  # (ts, track, top, zone, activity, p, phone)
    for piece in video.pieces(s.recordings, cam, date):
        for ts, frame, later in video.sample(piece, s.step_sec):
            for track, p, act, conf in judge(looker, model, frame, later, tracker):
                looks.append((ts, track, p.top, p.zone, act, conf, p.phone))
        say(f"  {os.path.basename(piece.path)} judged")
    by_track = defaultdict(list)
    for row in looks:
        by_track[row[1]].append(row)
    minutes = defaultdict(Counter)  # top colour -> activity -> minutes
    hours = defaultdict(Counter)    # hour -> activity -> minutes
    phone = Counter()
    step_min = s.step_sec / 60
    rows_out = []
    for track, rows in by_track.items():
        top = Counter(r[2] for r in rows).most_common(1)[0][0]
        acts = learn.smooth([r[4] for r in rows])
        for r, a in zip(rows, acts):
            minutes[top][a] += step_min
            hours[r[0].hour][a] += step_min
            if r[6] or a == "phone":
                phone[top] += step_min
            rows_out.append((_key(r[0]), track, top, r[3], a, round(r[5], 3), int(r[6])))
    rows_out.sort()
    out_csv = os.path.join(s.activity, cam, f"{date}.csv")
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["time", "person", "top", "zone", "activity", "sure", "phone_seen"])
        w.writerows(rows_out)
    bunny = burst_minutes(s, cam, date)
    path = os.path.join(s.reports, f"{cam}-{date}.html")
    os.makedirs(s.reports, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(report_html(cam, date, model.name, minutes, phone, hours, bunny, s.step_sec))
    say(f"report: {path}")
    return path


def burst_minutes(s, cam, date):
    """What Bunny's bursts made of the day: top colour -> activity -> minutes."""
    out = defaultdict(Counter)
    for folder in bursts.burst_folders(s.bursts, cam, date):
        look = bursts.read(folder)
        for p in look.get("people") or []:
            for a in p.get("activities") or []:
                if a != "away":
                    out[p.get("top", "other")][a if a in ACTIVITIES else "other"] += BURST_MINUTES_PER_FRAME
    return out


def report_html(cam, date, model_name, minutes, phone, hours, bunny, step):
    esc = html.escape
    fmt = lambda m: f"{m / 60:.1f} h" if m >= 60 else (f"{m:.0f} min" if m >= 1 else "-")  # noqa: E731
    acts = [a for a in ACTIVITIES if any(minutes[t][a] or bunny[t][a] for t in set(minutes) | set(bunny))]
    people = sorted(set(minutes) | set(bunny), key=lambda t: -sum(minutes[t].values()))
    rows = []
    for t in people:
        cells = "".join(f"<td>{fmt(minutes[t][a])}<small>{fmt(bunny[t][a]) if bunny.get(t) else ''}</small></td>" for a in acts)
        rows.append(f"<tr><th><span class=sw style='background:{esc(t)}'></span>{esc(t)}</th><td>{fmt(sum(minutes[t].values()))}</td>{cells}<td>{fmt(phone[t])}</td></tr>")
    hour_rows = []
    for h in sorted(hours):
        total = sum(hours[h].values()) or 1
        bar = "".join(f"<i class='a-{a}' style='width:{100 * hours[h][a] / total:.1f}%' title='{a} {fmt(hours[h][a])}'></i>" for a in ACTIVITIES if hours[h][a])
        hour_rows.append(f"<tr><th>{h:02d}:00</th><td class=bar>{bar}</td><td>{fmt(total)}</td></tr>")
    legend = "".join(f"<span><i class='a-{a}'></i>{a}</span>" for a in ACTIVITIES)
    head = "".join(f"<th>{a}</th>" for a in acts)
    return f"""<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Kitchen day {esc(date)}</title><style>
:root{{--bg:#fbfaf7;--ink:#1d2421;--muted:#66706b;--line:#e3e0d8}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}}
main{{max-width:1000px;margin:auto}} h1{{font-size:24px;margin:0}} p.sub{{color:var(--muted);margin:4px 0 20px}}
.tbl{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;margin:8px 0 28px}}
th,td{{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}}
td small{{display:block;color:var(--muted);font-size:12px}} .sw{{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid #0003;margin-right:6px;vertical-align:-1px}}
td.bar{{width:70%}} td.bar i,.legend i{{display:inline-block;height:14px}} .legend span{{margin-right:12px;font-size:13px;color:var(--muted)}} .legend i{{width:12px;margin-right:4px;vertical-align:-2px}}
.a-folding{{background:#e07a3f}}.a-machine{{background:#8a6bd1}}.a-filling{{background:#d1a33c}}.a-cooking{{background:#d4524a}}.a-packing{{background:#3f8fd1}}
.a-cleaning{{background:#3fb6a8}}.a-phone{{background:#222}}.a-idle{{background:#b9b4a8}}.a-other{{background:#7d8a84}}
</style></head><body><main>
<h1>Kitchen day · {esc(date)}</h1>
<p class=sub>Camera {esc(cam)} · our model {esc(model_name)}, a look every {step:.0f} s. Small grey figures: what Bunny's bursts made of the same day (a burst every 35 min).</p>
<h2>Each person, by the colour of their top</h2>
<div class=tbl><table><thead><tr><th>Person</th><th>In view</th>{head}<th>Phone</th></tr></thead><tbody>{''.join(rows) or '<tr><td>No one seen</td></tr>'}</tbody></table></div>
<h2>Hour by hour</h2><p class=legend>{legend}</p>
<div class=tbl><table><tbody>{''.join(hour_rows)}</tbody></table></div>
</main></body></html>"""


def in_hours(now, hours):
    hm = now.strftime("%H:%M")
    return hours[0] <= hm < hours[1]


def live(s, looker, model, cam, url, minutes=None, say=print):
    """Watch the kitchen: a look every live_every_sec seconds in working hours; each minute, one line per
    person to <root>\\activity\\<cam>\\live-<date>.csv (the activity they were at most that minute)."""
    tracker = Tracker()
    stop = time.time() + minutes * 60 if minutes else None
    cap = None
    minute, buf = None, defaultdict(list)

    def flush():
        if not buf or minute is None:
            return
        path = os.path.join(s.activity, cam, f"live-{minute[:10]}.csv")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        new = not os.path.exists(path)
        with open(path, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["minute", "person", "top", "zone", "activity", "looks", "phone_looks"])
            for track, rows in sorted(buf.items()):
                acts = Counter(r[2] for r in rows)
                w.writerow([minute, track, Counter(r[0] for r in rows).most_common(1)[0][0], Counter(r[1] for r in rows).most_common(1)[0][0],
                            acts.most_common(1)[0][0], len(rows), sum(1 for r in rows if r[3])])
        buf.clear()

    while stop is None or time.time() < stop:
        now = datetime.now()
        if not in_hours(now, s.hours):
            flush()
            if cap is not None:
                cap.release()
                cap = None
            time.sleep(60)
            continue
        if cap is None or not cap.isOpened():
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                say("camera not reachable - trying again in a minute")
                cap = None
                time.sleep(60)
                continue
        t0 = time.time()
        ok, frame = cap.read()
        later = None
        t1 = time.time()
        while ok and time.time() - t1 < 1.0:
            ok, later = cap.read()
        if frame is None or not ok:
            cap.release()
            cap = None
            continue
        m = now.strftime("%Y-%m-%dT%H:%M")
        if m != minute:
            flush()
            minute = m
        for track, p, act, conf in judge(looker, model, frame, later, tracker):
            buf[track].append((p.top, p.zone, act, p.phone))
        # keep reading (so the next look is current) until the next one is due
        while time.time() - t0 < s.live_every_sec:
            if not cap.grab():
                break
    flush()
    if cap is not None:
        cap.release()
