"""Everyone in a recorded day followed from frame to frame - one row per person - so what they do can
be labelled on video by the people working (owner, 30 Oct 2026: "I don't believe in Bunny burst
detection... label them with the help of the people working"). Each labelled stretch then becomes
2-second clips of that one person in a folder per activity (kai/clips.py), for a video model.

How a day becomes rows (tried on 30 Oct 13:59-14:02 first):
1. The person finder looks at 5 frames a second.
2. Pieces: a box belongs to the person whose box 0.2 s before overlaps it most - unless its top's
   colours differ from that person's usual colours (when two people cross, yellow must not take over
   red's box: the trial's first try swapped them). Hidden up to 2 s (behind someone) is still the same
   piece. Pieces under 2 s are the finder guessing (an arm, a sack) and are dropped; a piece whose box
   never moves is marked "probably not a person".
3. People (rows): a new piece joins the person whose last piece ended under a minute before, if it
   looks alike (picture reader + clothes colours) - never two pieces at the same moment. A longer gap
   starts a new person; the labelling page suggests "same person as Person N?" and the labeller joins
   them and names each person once.
4. One small picture of the person every 5 s: the blocks the labelling page shows and labels.

One SQLite file per camera and day: <root>\\rows\\<camera>\\<date>.sqlite. Times are seconds after that
day's midnight (PC clock, like the recordings). Each 30-minute recording is done once (`files`), so
the evening job only does what's new; pieces break where one recording ends, and step 3 joins them."""
import os
import re
import sqlite3
import threading
from datetime import datetime

import numpy as np
import cv2

from . import video
from .models import PERSON
from .people import GREY_BINS, HUE_BINS, MIN_HEIGHT, MIN_SCORE, colours_of
from .track import iou

FOLLOW_FPS = 5        # frames a second looked at: in 0.2 s a person barely moves, so their boxes overlap
SAME_IOU = 0.2        # overlap with the box 0.2 s before to be the same person
TOP_GATE = 0.6        # ...and the top's colours at least this alike to the piece's usual ones
ANCHOR_RATE = 0.03    # how fast a piece's usual colours follow the newest box (slow: a crossing can't drag them)
MISSED_S = 2.0        # hidden this long and still the same piece
MIN_PIECE_S = 2.0     # shorter pieces are the finder guessing
STILL = 0.01          # a box that never moves more than this share of the picture: probably not a person
JOIN_GAP_S = 60.0     # pieces this close in time that look alike are one person
SAME_LOOK = 0.75      # how alike (picture reader + clothes colours) to join on its own
LONG_S = 30.0         # a piece this long is someone working, not a scrap...
STRONG_LOOK = 0.85    # ...and joins someone this alike however long apart (30 Oct: the folder came out as 4
                      # people 0.86-0.93 alike, the two men in red only 0.44-0.57 alike)
ALIKE = 0.6           # how alike to suggest "same person?" on the labelling page
BLOCK_S = 5           # one small picture every 5 s: what is shown and labelled
THUMB_W, THUMB_H = 96, 144
CROPS_KEPT = 12       # bigger crops kept per piece for the picture reader (thinned evenly)

SCHEMA = """
create table if not exists files (path text primary key, done_at text);
create table if not exists persons (id integer primary key autoincrement, who text);  -- a number once gone is never given again
create table if not exists pieces (
  id integer primary key, person integer references persons(id), start real, "end" real,
  still integer, look blob, n integer);
create table if not exists boxes (piece integer, t real, x1 real, y1 real, x2 real, y2 real, score real, primary key (piece, t));
create table if not exists thumbs (piece integer, t real, jpg blob, primary key (piece, t));
create table if not exists labels (piece integer, t real, label text, by text, at text, primary key (piece, t));
"""
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def top_alike(a, b):
    """How alike two people's tops are (the first half of colours_of: the jeans are alike on everyone)."""
    n = HUE_BINS + GREY_BINS
    x, y = a[:n], b[:n]
    return float(np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y) + 1e-9))


def look_alike(a, b):
    """How alike two looks are (picture reader's 384 numbers + clothes colours, half each)."""
    d = 384
    return 0.5 * float(np.dot(a[:d], b[:d])) + 0.5 * float(np.dot(a[d:], b[d:]))


def _long(p):
    return p["end"] - p["start"] >= LONG_S


def _overlaps(p, ps):
    return any(p["start"] < q["end"] - 0.5 and q["start"] < p["end"] - 0.5 for q in ps)


def _unit(v):
    return v / (np.linalg.norm(v) + 1e-9)


def thumb(frame, box):
    """The person (box 0-1, with a little room) as a small JPEG for the labelling page."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = box
    mx, my = 0.1 * (x2 - x1), 0.05 * (y2 - y1)
    c = frame[max(0, int((y1 - my) * h)):int((y2 + my) * h), max(0, int((x1 - mx) * w)):int((x2 + mx) * w)]
    out = np.full((THUMB_H, THUMB_W, 3), 124, np.uint8)
    if c.size:
        r = min(THUMB_W / c.shape[1], THUMB_H / c.shape[0])
        cw, ch = max(1, round(c.shape[1] * r)), max(1, round(c.shape[0] * r))
        out[(THUMB_H - ch) // 2:(THUMB_H - ch) // 2 + ch, (THUMB_W - cw) // 2:(THUMB_W - cw) // 2 + cw] = cv2.resize(c, (cw, ch), interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes()


class Piece:
    def __init__(self, t, box, score, col):
        self.boxes = [(t, *box, score)]
        self.anchor = col.copy()
        self.col_sum = col.copy()
        self.thumbs = {}   # block start: JPEG
        self.crops = []

    @property
    def box(self):
        return self.boxes[-1][1:5]

    @property
    def start(self):
        return self.boxes[0][0]

    @property
    def end(self):
        return self.boxes[-1][0]

    def take(self, t, box, score, col):
        self.boxes.append((t, *box, score))
        self.anchor = (1 - ANCHOR_RATE) * self.anchor + ANCHOR_RATE * col
        self.col_sum += col

    def keep_pictures(self, t, frame, box):
        block = int(t // BLOCK_S) * BLOCK_S
        if block in self.thumbs:
            return
        self.thumbs[block] = thumb(frame, box)
        h, w = frame.shape[:2]
        c = frame[int(box[1] * h):int(box[3] * h), int(box[0] * w):int(box[2] * w)]
        if c.size:
            if c.shape[0] > 224:
                c = cv2.resize(c, (max(1, round(c.shape[1] * 224 / c.shape[0])), 224), interpolation=cv2.INTER_AREA)
            self.crops.append(c)
            if len(self.crops) > CROPS_KEPT:
                self.crops = self.crops[::2]

    def worth_keeping(self):
        return self.end - self.start >= MIN_PIECE_S - 1e-6 and len(self.boxes) >= 5

    def still(self):
        a = np.array([b[1:5] for b in self.boxes])
        return bool((a.max(0) - a.min(0)).max() < STILL)


class Follower:
    """Boxes into pieces, frame by frame (see the top of this file, step 2)."""

    def __init__(self):
        self.live = []

    def update(self, t, found, frame=None):
        """found: [(box 0-1, score, colours)] in one frame at time t. Returns the pieces that ended (not
        seen for MISSED_S)."""
        pairs = []
        for i, (box, _, col) in enumerate(found):
            for p in self.live:
                o = iou(box, p.box)
                if o < SAME_IOU:
                    continue
                c = top_alike(col, p.anchor)
                if c >= TOP_GATE:
                    pairs.append((o + 0.2 * c, i, p))
        pairs.sort(key=lambda x: -x[0])
        given, taken = {}, set()
        for _, i, p in pairs:
            if i in given or id(p) in taken:
                continue
            given[i] = p
            taken.add(id(p))
        for i, (box, score, col) in enumerate(found):
            p = given.get(i)
            if p is None:
                p = Piece(t, box, score, col)
                self.live.append(p)
            else:
                p.take(t, box, score, col)
            if frame is not None:
                p.keep_pictures(t, frame, box)
        ended = [p for p in self.live if t - p.end > MISSED_S]
        self.live = [p for p in self.live if t - p.end <= MISSED_S]
        return ended

    def close_all(self):
        out, self.live = self.live, []
        return out


class RowsDB:
    def __init__(self, folder, cam, date):
        if not DATE.match(date):
            raise ValueError(f"not a date: {date}")
        self.date = date
        self.path = os.path.join(folder, cam, f"{date}.sqlite")
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        if "autoincrement" not in self.db.execute("select sql from sqlite_master where name='persons'").fetchone()[0]:
            self.db.executescript("create table persons2 (id integer primary key autoincrement, who text);"
                                  "insert into persons2 select id, who from persons; drop table persons; alter table persons2 rename to persons;")
        self.lock = threading.RLock()

    @staticmethod
    def days(folder, cam):
        d = os.path.join(folder, cam)
        return sorted(f[:-7] for f in os.listdir(d) if f.endswith(".sqlite") and DATE.match(f[:-7])) if os.path.isdir(d) else []

    def close(self):
        self.db.close()

    # --- the evening job --------------------------------------------------------------------------
    def file_done(self, path):
        return self.db.execute("select 1 from files where path=?", (path,)).fetchone() is not None

    def mark_file(self, path):
        with self.lock:
            self.db.execute("insert or replace into files (path, done_at) values (?,?)", (path, datetime.now().isoformat(timespec="seconds")))
            self.db.commit()

    def add_piece(self, p, look):
        with self.lock:
            pid = self.db.execute('insert into pieces (start, "end", still, look, n) values (?,?,?,?,?)',
                                  (round(p.start, 2), round(p.end, 2), int(p.still()), look.astype(np.float32).tobytes(), len(p.boxes))).lastrowid
            self.db.executemany("insert or replace into boxes values (?,?,?,?,?,?,?)",
                                [(pid, round(b[0], 2), *(round(v, 4) for v in b[1:5]), round(b[5], 3)) for b in p.boxes])
            self.db.executemany("insert or replace into thumbs values (?,?,?)", [(pid, t, j) for t, j in p.thumbs.items()])
            self.db.commit()
            return pid

    def _pieces(self, where="1=1", args=()):
        rows = self.db.execute(f'select id, person, start, "end", still, look, n from pieces where {where} order by start', args).fetchall()
        return [{"id": r["id"], "person": r["person"], "start": r["start"], "end": r["end"], "still": bool(r["still"]),
                 "look": np.frombuffer(r["look"], np.float32), "n": r["n"]} for r in rows]

    def join_new(self):
        """Pieces with no person yet joined to someone (step 3): long pieces first, oldest first, then the
        short ones. Returns how many people were added."""
        with self.lock:
            pieces = self._pieces()
            by_person = {}
            for p in pieces:
                if p["person"] is not None:
                    by_person.setdefault(p["person"], []).append(p)
            added = 0
            new = sorted((x for x in pieces if x["person"] is None), key=lambda x: (not _long(x), x["start"]))
            for p in new:
                best, bv = None, None  # most alike; if equally alike, the nearest in time
                for person, ps in by_person.items():
                    # One person can't be in two places at once - but a scrap stuck to someone (an arm,
                    # a second box on them) mustn't keep a long piece of the real person out.
                    if _overlaps(p, [q for q in ps if _long(q)] if _long(p) else ps):
                        continue
                    gap, near = min(((max(0.0, q["start"] - p["end"], p["start"] - q["end"]), q) for q in ps), key=lambda x: x[0])
                    v = look_alike(p["look"], near["look"])
                    if not ((gap <= JOIN_GAP_S and v >= SAME_LOOK) or (_long(p) and _long(near) and v >= STRONG_LOOK)):
                        continue
                    score = (round(v, 3), -gap)
                    if bv is None or score > bv:
                        best, bv = person, score
                if best is None:
                    best = self.db.execute("insert into persons (who) values (null)").lastrowid
                    by_person[best] = []
                    added += 1
                self.db.execute("update pieces set person=? where id=?", (best, p["id"]))
                p["person"] = best
                by_person[best].append(p)
            self.db.commit()
            return added

    def rejoin(self):
        """Every piece joined again from scratch - only for a day nobody has named or labelled yet."""
        with self.lock:
            if self.db.execute("select 1 from labels limit 1").fetchone() or self.names():
                raise ValueError(f"{self.date} has names or labels: join by hand on the page instead")
            self.db.execute("update pieces set person=null")
            self.db.execute("delete from persons")
            self.db.execute("delete from sqlite_sequence where name='persons'")  # numbered from 1 again
            self.db.commit()
        return self.join_new()

    # --- the labelling page --------------------------------------------------------------------------
    def persons(self):
        """Everyone in the day, with their pieces, how much is labelled, and who else they look like."""
        pieces = self._pieces("person is not null")
        blocks = {r[0]: r[1] for r in self.db.execute("select piece, count(*) from thumbs group by piece")}
        done = {r[0]: r[1] for r in self.db.execute("select piece, count(*) from labels group by piece")}
        who = {r["id"]: r["who"] for r in self.db.execute("select id, who from persons")}
        out = {}
        for p in pieces:
            o = out.setdefault(p["person"], {"id": p["person"], "who": who.get(p["person"]), "pieces": [], "looks": []})
            o["pieces"].append({"id": p["id"], "start": p["start"], "end": p["end"], "still": p["still"],
                                "blocks": blocks.get(p["id"], 0), "labelled": done.get(p["id"], 0)})
            o["looks"].append((p["end"] - p["start"], p["look"]))
        people = sorted(out.values(), key=lambda o: o["pieces"][0]["start"])
        for o in people:
            o["first"], o["last"] = o["pieces"][0]["start"], max(x["end"] for x in o["pieces"])
            o["seen"] = round(sum(x["end"] - x["start"] for x in o["pieces"]), 1)
            o["blocks"] = sum(x["blocks"] for x in o["pieces"])
            o["labelled"] = sum(x["labelled"] for x in o["pieces"])
            o["still"] = all(x["still"] for x in o["pieces"])
            longest = max(o["pieces"], key=lambda x: x["end"] - x["start"])
            o["cover"] = {"piece": longest["id"], "t": int(((longest["start"] + longest["end"]) / 2) // BLOCK_S * BLOCK_S)}
            v = sum(w * lk for w, lk in o["looks"])
            o["look"] = np.concatenate([_unit(v[:384]), _unit(v[384:])])
        for o in people:
            alike = []
            for q in people:
                if q is o or any(a["start"] < b["end"] - 0.5 and b["start"] < a["end"] - 0.5 for a in o["pieces"] for b in q["pieces"]):
                    continue
                v = look_alike(o["look"], q["look"])
                if v >= ALIKE:
                    alike.append({"id": q["id"], "who": q["who"], "alike": round(v, 2)})
            o["alike"] = sorted(alike, key=lambda x: -x["alike"])[:3]
        for o in people:
            del o["looks"], o["look"]
        return people

    def blocks(self, person):
        """Every 5-second block of a person, in time order: [{piece, t, label, by}]."""
        rows = self.db.execute("select t.piece, t.t, l.label, l.by from thumbs t join pieces p on p.id = t.piece "
                               "left join labels l on l.piece = t.piece and l.t = t.t where p.person = ? order by t.t, t.piece", (person,)).fetchall()
        return [{"piece": r[0], "t": r[1], "label": r[2], "by": r[3]} for r in rows]

    def thumb(self, piece, t):
        r = self.db.execute("select jpg from thumbs where piece=? and t=?", (piece, t)).fetchone()
        return r[0] if r else None

    def boxes(self, piece, t0, t1):
        """[(t, (x1, y1, x2, y2))] of a piece between two times."""
        return [(r[0], tuple(r[1:5])) for r in self.db.execute(
            "select t, x1, y1, x2, y2 from boxes where piece=? and t>=? and t<? order by t", (piece, t0, t1))]

    def set_labels(self, items, label, by):
        """items: [(piece, block start)]; label None clears them."""
        with self.lock:
            if label is None:
                self.db.executemany("delete from labels where piece=? and t=?", items)
            else:
                at = datetime.now().isoformat(timespec="seconds")
                self.db.executemany("insert or replace into labels values (?,?,?,?,?)", [(p, t, label, by, at) for p, t in items])
            self.db.commit()

    def set_who(self, person, who):
        with self.lock:
            self.db.execute("update persons set who=? where id=?", ((who or "").strip() or None, person))
            self.db.commit()

    def move_piece(self, piece, to=None):
        """A piece that is someone else: to another person, or a new one (to=None). Returns the person."""
        with self.lock:
            if to is None:
                to = self.db.execute("insert into persons (who) values (null)").lastrowid
            self.db.execute("update pieces set person=? where id=?", (to, piece))
            self._drop_empty()
            self.db.commit()
            return to

    def join(self, person, into):
        """Two people who are one: every piece of `person` moves to `into` (who keeps `into`'s name, or
        takes `person`'s if `into` has none)."""
        with self.lock:
            names = {r[0]: r[1] for r in self.db.execute("select id, who from persons where id in (?,?)", (person, into))}
            self.db.execute("update pieces set person=? where person=?", (into, person))
            if not names.get(into) and names.get(person):
                self.db.execute("update persons set who=? where id=?", (names[person], into))
            self._drop_empty()
            self.db.commit()

    def _drop_empty(self):
        self.db.execute("delete from persons where id not in (select distinct person from pieces where person is not null)")

    def timeline(self):
        """Per person, their seen and labelled stretches: [{id, who, spans: [[t0, t1, label or null]]}]."""
        out = []
        for o in self.persons():
            spans = []
            for b in self.blocks(o["id"]):
                t0, t1 = b["t"], b["t"] + BLOCK_S
                if spans and spans[-1][2] == b["label"] and t0 - spans[-1][1] <= BLOCK_S:
                    spans[-1][1] = t1
                else:
                    spans.append([t0, t1, b["label"]])
            out.append({"id": o["id"], "who": o["who"], "spans": spans})
        return out

    def stretches(self):
        """The labelled stretches, for the clips: [{piece, person, who, label, by, t0, t1}] - next-door
        blocks of one piece with one label run together (a stretch ends where the piece does)."""
        rows = self.db.execute('select l.piece, p.person, s.who, l.t, l.label, l.by, p.start, p."end" from labels l join pieces p on p.id = l.piece '
                               "left join persons s on s.id = p.person order by l.piece, l.t").fetchall()
        out = []
        for r in rows:
            piece, person, who, t, label, by, start, end = r
            last = out[-1] if out else None
            if last and last["piece"] == piece and last["label"] == label and abs(t - last["t1"]) < 1e-6:
                last["t1"] = t + BLOCK_S
                last["by"].append(by)
            else:
                out.append({"piece": piece, "person": person, "who": who, "label": label, "by": [by], "t0": max(t, start), "t1": t + BLOCK_S, "end": end})
        for s in out:
            s["t1"] = min(s["t1"], s.pop("end") + 1.0 / FOLLOW_FPS)
            s["by"] = max(set(s["by"]), key=s["by"].count)
        return out

    def counts(self):
        return {r[0]: r[1] for r in self.db.execute("select label, count(*) from labels group by label")}

    def names(self):
        return [r[0] for r in self.db.execute("select distinct who from persons where who is not null order by who")]


def seconds_of(when, date):
    return (when - datetime.strptime(date, "%Y-%m-%d")).total_seconds()


def clock(t):
    t = int(t)
    return f"{t // 3600:02d}:{t % 3600 // 60:02d}:{t % 60:02d}"


def follow(s, finder, reader, cam, date, only=None, say=print):
    """Step 1-4 for every recording of the day not done yet (or just the one starting `only`, e.g.
    "13-51"). Returns (recordings done, pieces kept)."""
    db = RowsDB(os.path.join(s.root, "rows"), cam, date)
    files = kept = 0
    try:
        for rec in video.pieces(s.recordings, cam, date):
            name = os.path.basename(rec.path)
            if db.file_done(rec.path) or (only and not name.startswith(only)):
                continue
            t_start = datetime.now()
            f, n = Follower(), 0

            def save(ps):
                nonlocal kept
                for p in ps:
                    if not p.worth_keeping():
                        continue
                    crops = p.crops[:: max(1, len(p.crops) // 6)][:6] or []
                    dino = _unit(np.mean(reader.read(crops), axis=0)) if crops else np.zeros(384, np.float32)
                    db.add_piece(p, np.concatenate([dino, _unit(p.col_sum)]).astype(np.float32))
                    kept += 1

            for when, frame in video.every(rec, s.follow_fps):
                frame = video.fit_width(frame, s.width)
                h, w = frame.shape[:2]
                found = []
                for b in finder.find(frame, min_score=MIN_SCORE, classes=(PERSON,)):
                    if (b[3] - b[1]) / h >= MIN_HEIGHT:
                        found.append(((b[0] / w, b[1] / h, b[2] / w, b[3] / h), b[4], colours_of(frame, b[:4])))
                save(f.update(seconds_of(when, date), found, frame))
                n += 1
            save(f.close_all())
            db.join_new()
            db.mark_file(rec.path)
            files += 1
            say(f"  rows {name}: {n} frames in {(datetime.now() - t_start).total_seconds():.0f} s")
        people = len(db.persons())
        say(f"rows {date}: {files} recordings done, {kept} pieces kept, {people} people in the day")
    finally:
        db.close()
    return files, kept

