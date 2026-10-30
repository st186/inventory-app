"""The dataset: one SQLite file (<root>\\dataset\\kai.sqlite) with every frame looked at, every person
found in it, and their labels - Bunny's (from the bursts) and yours (from the labelling page; yours
always win). Crops and frame pictures sit next to it as JPEGs for the labelling page."""
import os
import sqlite3
import threading
from datetime import datetime

import numpy as np
import cv2

ACTIVITIES = ["folding", "machine", "prep", "filling", "cooking", "packing", "cleaning", "phone", "idle", "other"]
NOT_A_PERSON = "not-a-person"  # your label for a wrong box; such boxes are left out of training

SCHEMA = """
create table if not exists frames (
  id integer primary key, cam text not null, ts text not null, source text not null,
  image text, w integer, h integer, unique (cam, ts, source));
create table if not exists people (
  id integer primary key, frame_id integer not null references frames(id),
  x1 real, y1 real, x2 real, y2 real, score real, top text, zone text, phone integer,
  motion real, moving real, feat blob, crop text);
create index if not exists people_frame on people(frame_id);
create table if not exists labels (
  person_id integer primary key references people(id),
  ai text, ai_phone integer, owner text, owner_at text);
create table if not exists preds (
  person_id integer primary key references people(id), model text, label text, p real);
create table if not exists pieces (path text primary key, done_at text);
"""


class Store:
    def __init__(self, folder):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        self.db = sqlite3.connect(os.path.join(folder, "kai.sqlite"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()

    # --- writing -------------------------------------------------------------------------------
    def has_frame(self, cam, ts, source):
        return self.db.execute("select 1 from frames where cam=? and ts=? and source=?", (cam, ts, source)).fetchone() is not None

    def add_frame(self, cam, ts, source, frame, people):
        """A looked-at frame and its people; the frame picture is kept (small) only if someone is in it.
        Returns the new person ids, in order."""
        date = ts[:10]
        with self.lock:
            image = None
            h, w = frame.shape[:2]
            if people:
                image = os.path.join("frames", cam, date, f"{source}-{ts[11:19].replace(':', '')}.jpg")
                _save(os.path.join(self.folder, image), frame, 640)
            cur = self.db.execute("insert or ignore into frames (cam, ts, source, image, w, h) values (?,?,?,?,?,?)",
                                  (cam, ts, source, image, w, h))
            if not cur.rowcount:
                return []
            fid = cur.lastrowid
            ids = []
            for p in people:
                c = self.db.execute(
                    "insert into people (frame_id, x1, y1, x2, y2, score, top, zone, phone, motion, moving, feat) values (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (fid, *p.box, p.score, p.top, p.zone, int(p.phone), p.motion, p.moving, p.feat.astype(np.float16).tobytes()))
                pid = c.lastrowid
                crop = os.path.join("crops", cam, date, f"{pid}.jpg")
                _save(os.path.join(self.folder, crop), p.crop, None, max_h=256)
                self.db.execute("update people set crop=? where id=?", (crop, pid))
                ids.append(pid)
            self.db.commit()
            return ids

    def piece_done(self, path):
        return self.db.execute("select 1 from pieces where path=?", (path,)).fetchone() is not None

    def mark_piece(self, path):
        with self.lock:
            self.db.execute("insert or replace into pieces (path, done_at) values (?,?)", (path, datetime.now().isoformat(timespec="seconds")))
            self.db.commit()

    def set_zones(self, changes):
        """[(zone, person id)]"""
        with self.lock:
            self.db.executemany("update people set zone=? where id=?", changes)
            self.db.commit()

    def set_ai(self, person_id, label, phone):
        with self.lock:
            self.db.execute("insert into labels (person_id, ai, ai_phone) values (?,?,?) on conflict(person_id) do update set ai=excluded.ai, ai_phone=excluded.ai_phone",
                            (person_id, label, int(phone)))
            self.db.commit()

    def set_owner(self, person_id, label):
        with self.lock:
            self.db.execute("insert into labels (person_id, owner, owner_at) values (?,?,?) on conflict(person_id) do update set owner=excluded.owner, owner_at=excluded.owner_at",
                            (person_id, label, datetime.now().isoformat(timespec="seconds") if label else None))
            self.db.commit()

    def save_preds(self, model, rows):
        with self.lock:
            self.db.executemany("insert into preds (person_id, model, label, p) values (?,?,?,?) on conflict(person_id) do update set model=excluded.model, label=excluded.label, p=excluded.p",
                                [(pid, model, label, float(p)) for pid, label, p in rows])
            self.db.commit()

    # --- reading -------------------------------------------------------------------------------
    def people_rows(self, where="1=1", args=()):
        sql = f"""select p.*, f.cam, f.ts, f.source, f.image, l.ai, l.ai_phone, l.owner, pr.label as pred, pr.p as pred_p
                  from people p join frames f on f.id = p.frame_id left join labels l on l.person_id = p.id
                  left join preds pr on pr.person_id = p.id where {where}"""
        return self.db.execute(sql, args).fetchall()

    def training_rows(self):
        """People with a usable label: yours, or Bunny's where you haven't looked."""
        return [r for r in self.people_rows("(l.owner is not null or l.ai is not null)")
                if (r["owner"] or r["ai"]) in ACTIVITIES]

    def queue(self, mode, n=30, cam=None):
        """People for the labelling page. check = Bunny labelled them, you haven't (where the model
        disagrees with Bunny first); new = no label yet; unsure = the model is least sure."""
        cond = "l.owner is null"
        if cam:
            cond += " and f.cam = ?"
        args = (cam,) if cam else ()
        if mode == "check":
            rows = self.people_rows(cond + " and l.ai is not null", args)
            rows = sorted(rows, key=lambda r: (r["pred"] is None or r["pred"] == r["ai"], r["pred_p"] or 0, r["id"]))
        elif mode == "unsure":
            rows = sorted(self.people_rows(cond + " and pr.p is not null", args), key=lambda r: r["pred_p"])
        else:
            rows = self.people_rows(cond + " and l.ai is null", args)
            rows = sorted(rows, key=lambda r: (r["id"] * 2654435761) % 1000003)  # a fixed shuffle: all hours, not the first one
        return rows[:n]

    def stats(self):
        q = lambda s: self.db.execute(s).fetchone()[0]  # noqa: E731
        by = {}
        for r in self.db.execute("select coalesce(owner, ai) as lab, owner is not null as mine, count(*) n from labels group by lab, mine"):
            d = by.setdefault(r["lab"] or "-", {"yours": 0, "bunny": 0})
            d["yours" if r["mine"] else "bunny"] += r["n"]
        return {"frames": q("select count(*) from frames"), "people": q("select count(*) from people"),
                "yours": q("select count(*) from labels where owner is not null"),
                "bunny": q("select count(*) from labels where ai is not null"), "byLabel": by}

    def feat(self, row):
        return np.frombuffer(row["feat"], np.float16).astype(np.float32)


def _save(path, img, width, max_h=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    h, w = img.shape[:2]
    if width and w > width:
        img = cv2.resize(img, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)
    elif max_h and h > max_h:
        img = cv2.resize(img, (round(w * max_h / h), max_h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
