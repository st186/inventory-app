"""Tests for the kitchen model's plumbing, with stand-in models (no downloads needed). Run:
    python tools/kitchen-ai/tests/test_kai.py"""
import json
import os
import shutil
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import datetime

import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from kai import bursts, colours, config, jobs, learn, video, zones  # noqa: E402
from kai.look import Looker  # noqa: E402
from kai.models import PERSON, PHONE, _nms  # noqa: E402
from kai.store import ACTIVITIES, Store  # noqa: E402
from kai.track import Tracker, iou  # noqa: E402

passed = 0
TMP = tempfile.mkdtemp(prefix="kai-test-")


def test(name):
    def wrap(fn):
        global passed
        try:
            fn()
            passed += 1
        except Exception:
            print(f"FAIL {name}")
            raise
        return fn
    return wrap


class StubFinder:
    """Boxes given per call: a list of (x1, y1, x2, y2, score, cls) in pixels of a 1280-wide frame."""
    def __init__(self, boxes):
        self.boxes = boxes

    def find(self, frame, min_score=0.3):
        return [b for b in self.boxes if b[4] >= min_score]


class StubReader:
    """384 numbers from the crop's mean colour, so different-looking people get different numbers."""
    def read(self, crops):
        out = []
        for c in crops:
            v = np.zeros(384, np.float32)
            m = c.reshape(-1, 3).mean(0) / 255
            v[:3] = m
            v[3] = 1
            out.append(v / np.linalg.norm(v))
        return np.array(out, np.float32).reshape(-1, 384)


def person_frame(colour=(40, 40, 200), w=1280, h=720, box=(400, 100, 600, 600)):
    f = np.full((h, w, 3), 90, np.uint8)
    x1, y1, x2, y2 = box
    cv2.rectangle(f, (x1, y1), (x2, y2), colour, -1)
    return f


def write_video(path, seconds=20, fps=10, size=(1280, 720)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    for i in range(seconds * fps):
        f = person_frame()
        cv2.rectangle(f, (50 + i * 2, 650), (90 + i * 2, 690), (255, 255, 255), -1)  # something moving
        vw.write(f)
    vw.release()


@test("settings come from camera_watch.ini, with the data next to the recordings")
def _():
    ini = os.path.join(TMP, "cw.ini")
    with open(ini, "w", encoding="utf-8") as f:
        f.write("[server]\nurl = x\n[camera]\nid = cam-k\nkey = k\nstill_url = rtsp://a/stream1\nwatch_url = rtsp://a/stream2\n"
                "[record]\nfolder = D:\\BunnyCamera\\recordings\n[kitchen_ai]\nstep_sec = 5 ; faster\nhours = 08:00-20:00\n")
    s = config.load(ini)
    assert s.root == "D:\\BunnyCamera", s.root
    assert s.recordings.endswith("recordings") and s.step_sec == 5 and s.hours == ("08:00", "20:00")
    assert s.camera()["id"] == "cam-k" and s.camera("cam-k")["watch_url"].endswith("stream2")


@test("recorded pieces: finished ones listed with their start time, frames sampled and found by time")
def _():
    rec = os.path.join(TMP, "recordings")
    write_video(os.path.join(rec, "cam-k", "2026-10-31", "09-00-00.mp4"))
    with open(os.path.join(rec, "cam-k", "2026-10-31", "09-30-00.mp4"), "wb") as f:
        f.write(b"still recording")  # not finished: left out
    ps = video.pieces(rec, "cam-k", "2026-10-31")
    assert len(ps) == 1 and ps[0].start == datetime(2026, 10, 31, 9, 0, 0) and 19 <= ps[0].seconds <= 21, ps
    got = list(video.sample(ps[0], 5))
    assert [g[0].second for g in got] == [0, 5, 10, 15], [g[0] for g in got]
    assert all(g[1] is not None and g[2] is not None for g in got)
    a, b = video.frame_at(ps, datetime(2026, 10, 31, 9, 0, 7))
    assert a is not None and b is not None and a.shape == (720, 1280, 3)
    assert video.frame_at(ps, datetime(2026, 10, 31, 10, 0, 0)) == (None, None)
    assert video.fit_width(np.zeros((360, 640, 3), np.uint8), 1280).shape == (720, 1280, 3)


@test("zones: the feet decide, the smallest zone wins where two overlap")
def _():
    zdir = os.path.join(TMP, "zones")
    os.makedirs(zdir, exist_ok=True)
    with open(os.path.join(zdir, "cam-k.json"), "w", encoding="utf-8") as f:
        json.dump({"camera": "cam-k", "zones": [{"name": "Kitchen", "points": [[0, 0], [1, 0], [1, 1], [0, 1]]},
                                                {"name": "Folding table", "points": [[0.1, 0.5], [0.5, 0.5], [0.5, 0.9], [0.1, 0.9]]}]}, f)
    z = zones.load(zdir, "cam-k")
    assert zones.zone_of(z, 0.3, 0.7) == "Folding table"
    assert zones.zone_of(z, 0.8, 0.2) == "Kitchen"
    assert zones.zone_of([], 0.5, 0.5) == "" and zones.load(zdir, "nope") == []
    assert zones.names(z) == ["Folding table", "Kitchen"]
    # standing beside the table: feet outside it, body reaching in
    assert zones.touches(z, "Folding table", (0.45, 0.2, 0.7, 0.6))
    assert not zones.touches(z, "Folding table", (0.7, 0.1, 0.9, 0.4))
    assert not zones.touches(z, "Steamer", (0.45, 0.2, 0.7, 0.6))


@test("top colour in Bunny's words, and near misses")
def _():
    f = person_frame(colour=(30, 30, 200))  # BGR red
    assert colours.top_colour(f, (400, 100, 600, 600)) == "red"
    assert colours.top_colour(person_frame(colour=(20, 20, 20)), (400, 100, 600, 600)) == "black"
    assert colours.top_colour(person_frame(colour=(240, 240, 240)), (400, 100, 600, 600)) == "white"
    assert colours.distance("navy", "navy") == 0 and colours.distance("navy", "blue") == 0.5 and colours.distance("red", "green") == 1
    assert colours.distance("patterned", "red") == 0.7


@test("following people: small moves keep the same person; a newcomer gets a new number")
def _():
    t = Tracker()
    a = t.update([(0.1, 0.1, 0.3, 0.6), (0.6, 0.1, 0.8, 0.6)], ["black", "blue"])
    b = t.update([(0.12, 0.1, 0.32, 0.6), (0.6, 0.12, 0.8, 0.62)], ["black", "blue"])
    assert a == b, (a, b)
    c = t.update([(0.12, 0.1, 0.32, 0.6), (0.6, 0.12, 0.8, 0.62), (0.4, 0.5, 0.5, 0.9)], ["black", "blue", "red"])
    assert c[:2] == a and c[2] not in a
    # a step away in the same colour (no overlap) is still the same person
    d = t.update([(0.29, 0.1, 0.49, 0.6)], ["black"])
    assert d == [a[0]], d
    assert abs(iou((0, 0, 1, 1), (0.5, 0, 1.5, 1)) - 1 / 3) < 1e-6


@test("Bunny's people matched to boxes by colour and side; doubtful pairs dropped")
def _():
    assert bursts.match([{"top": "red", "where": ""}], [(0.5, "green")]) == {0: 0}  # one and one always pair
    ai = [{"top": "black", "where": "left, folding"}, {"top": "blue", "where": "right by the steamer"}]
    assert bursts.match(ai, [(0.8, "navy"), (0.2, "black")]) == {1: 0, 0: 1}
    # our colour reading failed, but the same two people and the sides settle it
    assert bursts.match(ai, [(0.2, "green"), (0.8, "red")]) == {0: 0, 1: 1}
    # more boxes than Bunny's people: colour must agree
    assert bursts.match(ai[:1], [(0.2, "green"), (0.8, "red")]) == {}
    assert bursts.match(ai[:1], [(0.2, "black"), (0.7, "white")]) == {0: 0}
    # the doorway is the top of the picture: far
    door = [{"top": "yellow", "where": "standing in doorway, top right"}, {"top": "red", "where": "seated at right by the stool"}]
    assert bursts.match(door, [(0.78, "grey", 0.62), (0.81, "blue", 0.33)]) == {1: 0, 0: 1}
    assert bursts.side("Centre of the table") == (0.25, 0.75) and bursts.side("by the door") is None
    look = {"people": [{"top": "black", "where": "left", "activities": ["folding", "away", "phone"], "phoneFrames": [3]},
                       {"top": "blue", "where": "", "activities": ["idle", "packing", "away"], "phoneFrames": []}]}
    assert [(n, a, ph) for n, _, a, ph in bursts.frame_labels(look, 0)] == [(0, "folding", False), (1, "idle", False)]
    assert [(n, a, ph) for n, _, a, ph in bursts.frame_labels(look, 2)] == [(0, "phone", True)]


@test("one look: people found, small or unsure boxes left out, phone, movement and zone")
def _():
    boxes = [(400, 100, 600, 600, 0.9, PERSON), (900, 600, 920, 620, 0.9, PERSON), (700, 100, 800, 500, 0.35, PERSON),
             (480, 300, 520, 340, 0.5, PHONE)]
    z = [("Folding table", (np.array([[0, 0], [10000, 0], [10000, 10000], [0, 10000]], np.int32)))]
    lk = Looker(StubFinder(boxes), StubReader(), z, width=1280, min_score=0.45)
    a = person_frame()
    b = a.copy()
    cv2.rectangle(b, (420, 120), (580, 300), (0, 255, 0), -1)  # their hands moved
    frame, people = lk.look(a, b)
    assert frame.shape[1] == 1280 and len(people) == 1, people
    p = people[0]
    assert p.phone and p.zone == "Folding table" and p.top == "red" and p.moving > 0.1 and p.feat.shape == (384,)
    assert abs(p.box[0] - 400 / 1280) < 1e-6
    _, still = lk.look(a, a.copy())
    assert still[0].moving == 0
    _, none = lk.look(a)
    assert none[0].motion is None


def _people(n_boxes=1, colour=(30, 30, 200)):
    lk = Looker(StubFinder([(400, 100, 600, 600, 0.9, PERSON), (800, 100, 1000, 600, 0.9, PERSON)][:n_boxes]), StubReader())
    return lk.look(person_frame(colour), person_frame(colour))


@test("the dataset: frames, people, Bunny's and your labels (yours win), queues and counts")
def _():
    st = Store(os.path.join(TMP, "ds1"))
    frame, people = _people(2)
    ids = st.add_frame("cam-k", "2026-10-31T09:00:00", "rec", frame, people)
    assert len(ids) == 2 and st.has_frame("cam-k", "2026-10-31T09:00:00", "rec")
    assert st.add_frame("cam-k", "2026-10-31T09:00:00", "rec", frame, people) == []  # the same frame twice
    assert os.path.exists(os.path.join(st.folder, st.people_rows("p.id=?", (ids[0],))[0]["crop"]))
    st.set_ai(ids[0], "folding", False)
    assert [r["id"] for r in st.queue("check")] == [ids[0]] and [r["id"] for r in st.queue("new")] == [ids[1]]
    st.set_owner(ids[0], "idle")
    st.set_owner(ids[1], "not-a-person")
    rows = st.training_rows()
    assert [(r["id"], r["owner"] or r["ai"]) for r in rows] == [(ids[0], "idle")]
    assert st.queue("check") == [] and st.stats()["yours"] == 2
    st.set_owner(ids[0], None)  # undo
    assert [r["id"] for r in st.queue("check")] == [ids[0]]
    assert st.feat(rows[0]).shape == (384,)


@test("training: learns separable activities, scores on unseen hours, smooths odd frames")
def _():
    rng = np.random.default_rng(1)
    centres = {a: rng.normal(0, 1, 384) for a in ACTIVITIES[:4]}
    rows = []
    for h in range(8):
        for i, a in enumerate(ACTIVITIES[:4] * 15):
            f = centres[a] + rng.normal(0, 0.6, 384)
            rows.append({"id": len(rows), "ts": f"2026-10-31T{9 + h:02d}:{i % 60:02d}:00", "owner": a if i % 3 == 0 else None,
                         "ai": a, "motion": 3.0 if a != "folding" else None, "moving": 0.1, "phone": 0, "zone": "Folding table" if a == "folding" else "",
                         "x1": 0.1, "y1": 0.1, "x2": 0.3, "y2": 0.6, "feat": (f / np.linalg.norm(f)).astype(np.float32)})
    model, report = learn.train(rows, lambda r: r["feat"])
    assert report["vsYours"]["accuracy"] > 0.9 and report["vsBunny"]["accuracy"] > 0.9, report
    assert report["labels"]["yours"] + report["labels"]["bunny"] == len(rows)
    folder = os.path.join(TMP, "model")
    model.save(folder, report)
    again = learn.Model.load(folder)
    X = learn.features(rows[:20], again.spec, lambda r: r["feat"])
    assert (again.proba(X).argmax(1) == model.proba(X).argmax(1)).all()
    assert learn.smooth(["folding", "phone", "folding", "folding"]) == ["folding"] * 4
    assert learn.smooth(["idle", "phone", "phone", "phone"]) == ["idle", "phone", "phone", "phone"]
    tr, te = learn.split(rows)
    assert tr and te and not ({r["ts"][:13] for r in tr} & {r["ts"][:13] for r in te})


def _settings(root):
    s = config.Settings(root=root, cameras=[{"id": "cam-k", "still_url": "", "watch_url": ""}], step_sec=5)
    s.zones = os.path.join(TMP, "zones")
    return s


@test("Bunny's burst labels land on the right boxes (recorded frame used where there is one)")
def _():
    root = os.path.join(TMP, "root1")
    s = _settings(root)
    write_video(os.path.join(s.recordings, "cam-k", "2026-10-31", "09-00-00.mp4"))
    folder = os.path.join(s.bursts, "cam-k", "2026-10-31", "09-00-05")
    os.makedirs(folder)
    for i in (1, 2):
        cv2.imwrite(os.path.join(folder, f"{i:02d}.jpg"), person_frame())
    with open(os.path.join(folder, "look.json"), "w", encoding="utf-8") as f:
        json.dump({"camera": "cam-k", "times": ["2026-10-31T09:00:05", "2026-10-31T09:00:40"], "gapSec": 15,  # 2nd frame not recorded
                   "people": [{"top": "red", "where": "left", "activities": ["folding", "phone"], "phoneFrames": [2]},
                              {"top": "white", "where": "right", "activities": ["idle", "away"], "phoneFrames": []}]}, f)
    os.makedirs(os.path.join(s.bursts, "cam-k", "2026-10-31", "10-00-00"))  # kept before labels came back
    with open(os.path.join(s.bursts, "cam-k", "2026-10-31", "10-00-00", "look.json"), "w") as f:
        json.dump({"times": ["2026-10-31T10:00:00"], "people": None}, f)
    st = Store(s.dataset)
    lk = Looker(StubFinder([(400, 100, 600, 600, 0.9, PERSON)]), StubReader())
    n = jobs.prelabel(s, st, lk, "cam-k", "2026-10-31", say=lambda *_: None)
    assert n == 2, n  # frame 1: red pairs with the box (white is extra); frame 2: one and one
    labs = sorted((r["ts"], r["ai"], r["ai_phone"]) for r in st.people_rows())
    assert labs == [("2026-10-31T09:00:05", "folding", 0), ("2026-10-31T09:00:40", "phone", 1)], labs
    first = st.people_rows("f.ts = ?", ("2026-10-31T09:00:05",))[0]
    assert first["motion"] is not None  # from the recording
    assert st.people_rows("f.ts = ?", ("2026-10-31T09:00:40",))[0]["motion"] is None  # the burst's own frame
    assert jobs.prelabel(s, st, lk, "cam-k", "2026-10-31", say=lambda *_: None) == 0  # done already
    assert jobs.burst_minutes(s, "cam-k", "2026-10-31")["red"]["folding"] == jobs.BURST_MINUTES_PER_FRAME


@test("harvest and a judged day: dataset filled once, CSV and report written")
def _():
    root = os.path.join(TMP, "root2")
    s = _settings(root)
    write_video(os.path.join(s.recordings, "cam-k", "2026-10-31", "09-00-00.mp4"))
    st = Store(s.dataset)
    lk = Looker(StubFinder([(400, 100, 600, 600, 0.9, PERSON)]), StubReader())
    assert jobs.harvest(s, st, lk, "cam-k", "2026-10-31", say=lambda *_: None) == (4, 4)
    assert jobs.harvest(s, st, lk, "cam-k", "2026-10-31", say=lambda *_: None) == (0, 0)
    assert st.piece_done(os.path.join(s.recordings, "cam-k", "2026-10-31", "09-00-00.mp4"))
    assert jobs.rezone(s, st, "cam-k", say=lambda *_: None) == 4  # zones drawn after the harvest
    assert {r["zone"] for r in st.people_rows()} == {"Folding table"}
    assert jobs.rezone(s, st, "cam-k", say=lambda *_: None) == 0
    rows = st.people_rows()
    for r in rows:
        st.set_owner(r["id"], "folding")
    k = len(ACTIVITIES)
    model = learn.Model(np.zeros((384 + 4 + 1 + 4, k), np.float32), np.eye(k, dtype=np.float32)[0] * 5,
                        np.zeros(384 + 9, np.float32), np.ones(384 + 9, np.float32), {"zones": [], "motion": 0, "moving": 0}, "test-model")
    assert jobs.predict_all(st, model, say=lambda *_: None) == 4
    assert st.people_rows()[0]["pred"] == "folding"
    path = jobs.day(s, lk, model, "cam-k", "2026-10-31", say=lambda *_: None)
    html = open(path, encoding="utf-8").read()
    assert "Kitchen day" in html and "red" in html and "folding" in html
    lines = open(os.path.join(s.activity, "cam-k", "2026-10-31.csv"), encoding="utf-8").read().splitlines()
    assert lines[0].startswith("time,person,top") and len(lines) == 5, lines


@test("the labelling page: page, queue, label, picture, undo")
def _():
    from kai import labelui
    st = Store(os.path.join(TMP, "ds-ui"))
    frame, people = _people(1)
    pid = st.add_frame("cam-k", "2026-10-31T11:00:00", "rec", frame, people)[0]
    st.set_ai(pid, "packing", False)
    server = labelui.ThreadingHTTPServer(("127.0.0.1", 0), labelui.make_handler(st, threading.Lock()))
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        get = lambda p: urllib.request.urlopen(f"http://127.0.0.1:{port}{p}").read()  # noqa: E731
        assert b"Kitchen labels" in get("/")
        items = json.loads(get("/api/next?mode=check"))["items"]
        assert [i["id"] for i in items] == [pid] and items[0]["ai"] == "packing"
        assert get(f"/img/crop/{pid}")[:2] == b"\xff\xd8" and get(f"/img/frame/{pid}")[:2] == b"\xff\xd8"

        def post(body):
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/label", json.dumps(body).encode(), {"Content-Type": "application/json"})
            try:
                return urllib.request.urlopen(req).status
            except urllib.error.HTTPError as e:
                return e.code
        assert post({"id": pid, "label": "folding"}) == 200
        assert st.people_rows("p.id=?", (pid,))[0]["owner"] == "folding"
        assert post({"id": pid, "label": "dancing"}) == 400
        assert json.loads(get("/api/next?mode=check"))["items"] == []
        assert post({"id": pid, "label": None}) == 200
        assert json.loads(get("/api/stats"))["yours"] == 0
    finally:
        server.shutdown()
        server.server_close()


@test("movement report: heatmap pictures, time per area, a walk between two stops")
def _():
    from kai import heatmap
    from kai.look import Person
    st = Store(os.path.join(TMP, "ds-heat"))
    crop = np.zeros((40, 20, 3), np.uint8)
    frame = np.full((720, 1280, 3), 90, np.uint8)
    spots = [("Folding table", (0.2, 0.5, 0.3, 0.85))] * 4 + [("Freezers", (0.8, 0.4, 0.9, 0.75))] * 3 + [("Freezers", (0.81, 0.4, 0.91, 0.75))]
    for i, (zone, box) in enumerate(spots):
        p = Person(box=box, score=0.9, top="red", zone=zone, phone=False, motion=None, moving=None, feat=np.zeros(384, np.float32), crop=crop)
        st.add_frame("cam-k", f"2026-10-31T10:00:{i * 5:02d}", "rec", frame, [p])  # 5 s apart: one walk
    pic = os.path.join(TMP, "kitchen.jpg")
    cv2.imwrite(pic, frame)
    path = heatmap.build(st, "cam-k", ["2026-10-31"], pic, os.path.join(TMP, "zones"), os.path.join(TMP, "heat"), step_s=10)
    page = open(path, encoding="utf-8").read()
    # placed in the zones as drawn now (the test's: a folding table inside the whole kitchen)
    assert "Folding table → Kitchen</td><td>1<" in page, page[page.find("Walks"):page.find("Walks") + 600]
    assert os.path.exists(os.path.join(TMP, "heat", "heatmap-2026-10-31.jpg")) and os.path.exists(os.path.join(TMP, "heat", "heatmap-2026-10-31-10.jpg"))
    per_zone, _, crowd = heatmap.summary(heatmap.samples(st, "cam-k", ["2026-10-31"]), 10)
    assert round(per_zone["Folding table"], 2) == round(4 * 10 / 60, 2) and crowd["Freezers"][0] == 1
    assert heatmap.build(st, "cam-k", ["2026-11-01"], pic, os.path.join(TMP, "zones"), os.path.join(TMP, "heat")) is None
    g = heatmap.density([(0.5, 0.5)] * 3)
    assert g.max() == 1.0 and g[54, 96] == 1.0


@test("overlapping boxes: the surer one kept")
def _():
    b = np.array([[0, 0, 10, 10], [1, 1, 10, 10], [20, 20, 30, 30]], np.float32)
    assert sorted(_nms(b, np.array([0.9, 0.8, 0.7]), 0.45)) == [0, 2]




def _col(top, bottom=30):
    """Clothes colours like colours_of: a top colour bin and a trouser bin, unit length."""
    v = np.zeros(48, np.float32)
    v[top], v[bottom] = 1, 1
    return v / np.linalg.norm(v)


@test("video rows: two people crossing keep their own pieces, flickers dropped, a box that never moves marked")
def _():
    from kai import rows
    red, yellow = _col(0), _col(3)
    f, ended = rows.Follower(), []
    for i in range(50):  # 10 s at 5 a second: red walks right, yellow left, through each other
        t = 100 + i * 0.2
        rx, yx = 0.1 + 0.5 * i / 49, 0.6 - 0.5 * i / 49
        found = [((rx, 0.2, rx + 0.2, 0.9), 0.9, red), ((yx, 0.25, yx + 0.2, 0.92), 0.9, yellow)]
        if i == 20:
            found.append(((0.8, 0.1, 0.85, 0.3), 0.5, _col(8)))  # the finder guessing, once
        ended += f.update(t, found)
    ended += f.close_all()
    kept = [p for p in ended if p.worth_keeping()]
    assert len(kept) == 2, [(p.start, p.end, len(p.boxes)) for p in ended]
    for p in kept:
        xs = [b[1] for b in p.boxes]
        assert len(p.boxes) == 50 and (xs == sorted(xs) or xs == sorted(xs, reverse=True)), xs  # nobody swapped at the crossing
        assert not p.still()
    sack = rows.Piece(0, (0.1, 0.1, 0.2, 0.4), 0.6, red)
    for i in range(1, 20):
        sack.take(i * 0.2, (0.1, 0.1, 0.2, 0.4), 0.6, red)
    assert sack.worth_keeping() and sack.still()


def _piece(start, end, look):
    from kai import rows
    p = rows.Piece(start, (0.1, 0.1, 0.3, 0.9), 0.9, _col(0))
    t = start
    while t < end - 1e-6:
        t = round(t + 0.2, 2)
        p.take(t, (0.1, 0.1, 0.3 + 0.01 * (t % 2), 0.9), 0.9, _col(0))
    p.thumbs = {int(x // 5 * 5): b"\xff\xd8jpg" for x in np.arange(start, end, 5)}
    return p, look


@test("video rows: pieces joined into people - not two at once, not after a long gap - and the page's helpers")
def _():
    from kai import rows
    a = np.zeros(432, np.float32)
    a[0], a[384] = 1, 1
    b = np.zeros(432, np.float32)
    b[0], b[2], b[384] = 0.8, 0.6, 1  # alike to a (0.9), but less than a itself
    other = np.zeros(432, np.float32)
    other[1], other[390] = 1, 1
    db = rows.RowsDB(os.path.join(TMP, "rows"), "cam-k", "2026-10-31")
    ids = [db.add_piece(*_piece(*x)) for x in [(0, 10, a), (30, 40, a), (5, 15, b), (200, 210, a), (50, 60, other)]]
    assert db.join_new() == 4
    who = {r["id"]: r["person"] for r in db.db.execute("select id, person from pieces")}
    assert who[ids[0]] == who[ids[1]]                       # 20 s apart, alike: one person
    assert who[ids[2]] != who[ids[0]]                       # at the same time: someone else
    assert who[ids[3]] not in (who[ids[0]], who[ids[2]])    # over a minute later: new, but suggested
    assert who[ids[4]] not in (who[ids[0]], who[ids[3]])    # looks different
    ppl = {p["id"]: p for p in db.persons()}
    assert {x["id"] for x in ppl[who[ids[3]]]["alike"]} == {who[ids[0]], who[ids[2]]}, ppl[who[ids[3]]]["alike"]
    assert ppl[who[ids[0]]]["seen"] == 20.0 and len(ppl[who[ids[0]]]["pieces"]) == 2
    db.set_who(who[ids[3]], "Vijay Das")
    db.join(who[ids[3]], who[ids[0]])                       # the labeller: same person
    assert db.db.execute("select who from persons where id=?", (who[ids[0]],)).fetchone()[0] == "Vijay Das"
    assert len(db.persons()) == 3 and db.names() == ["Vijay Das"]
    new = db.move_piece(ids[1])                             # "not Vijay": a person of its own
    assert new not in who.values() and len(db.persons()) == 4
    bl = db.blocks(who[ids[0]])
    assert [b["t"] for b in bl] == [0, 5, 200, 205] and all(b["label"] is None for b in bl)
    db.set_labels([(ids[0], 0), (ids[0], 5)], "folding", "Rudra")
    db.set_labels([(ids[3], 200)], "phone", "Rudra")
    st = db.stretches()
    assert [(x["label"], x["t0"], round(x["t1"], 1), x["who"], x["by"]) for x in st] == [
        ("folding", 0, 10, "Vijay Das", "Rudra"), ("phone", 200, 205, "Vijay Das", "Rudra")], st
    assert db.counts() == {"folding": 2, "phone": 1}
    tl = {p["id"]: p["spans"] for p in db.timeline()}[who[ids[0]]]
    assert tl == [[0, 10, "folding"], [200, 205, "phone"], [205, 210, None]], tl
    db.set_labels([(ids[0], 5)], None, "")
    assert db.counts() == {"folding": 1, "phone": 1}
    db.close()
    assert rows.RowsDB.days(os.path.join(TMP, "rows"), "cam-k") == ["2026-10-31"]
    # Long pieces: very alike joins however far apart, and a scrap stuck to that person doesn't stop it
    db = rows.RowsDB(os.path.join(TMP, "rows"), "cam-k", "2026-11-01")
    near = a.copy()
    near[1] = 0.45  # 0.95 alike to a after the unit step below
    near[:384] /= np.linalg.norm(near[:384])
    ids = [db.add_piece(*_piece(*x)) for x in [(0, 120, a), (100, 106, a), (500, 700, near), (150, 300, other)]]
    db.join_new()
    who = {r["id"]: r["person"] for r in db.db.execute("select id, person from pieces")}
    assert who[ids[2]] == who[ids[0]] and who[ids[3]] != who[ids[0]], who
    db.set_labels([(ids[0], 0)], "folding", "Rudra")
    try:
        db.rejoin()
        raise AssertionError("rejoin must refuse a labelled day")
    except ValueError:
        pass
    db.close()


class WalkingFinder:
    """One person walking slowly to the right: a box 2 px further on each look."""
    def __init__(self):
        self.i = 0

    def find(self, frame, min_score=0.3, classes=None):
        self.i += 1
        x = 400 + 2 * self.i
        return [(x, 100, x + 200, 600, 0.9, PERSON)]


@test("video rows end to end: a recorded day followed, labelled on the page, cut into clips")
def _():
    from kai import clips, labelui, rows, rowsui
    root = os.path.join(TMP, "rows-day")
    s = _settings(root)
    s.clip_every_s = 2
    write_video(os.path.join(s.recordings, "cam-k", "2026-10-31", "09-00-00.mp4"), seconds=12)
    assert rows.follow(s, WalkingFinder(), StubReader(), "cam-k", "2026-10-31", say=lambda m: None) == (1, 1)
    assert rows.follow(s, WalkingFinder(), StubReader(), "cam-k", "2026-10-31", say=lambda m: None) == (0, 0)  # done once
    db = rows.RowsDB(os.path.join(root, "rows"), "cam-k", "2026-10-31")
    (person,) = db.persons()
    piece = person["pieces"][0]["id"]
    assert [b["t"] for b in db.blocks(person["id"])] == [32400, 32405, 32410]  # 09:00:00, 09:00:05, 09:00:10
    assert db.thumb(piece, 32405)[:2] == b"\xff\xd8"
    db.close()

    server = labelui.ThreadingHTTPServer(("127.0.0.1", 0), labelui.make_handler(Store(os.path.join(root, "ds")), threading.RLock(), rowsui.Ctx(s, "cam-k")))
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        get = lambda p: urllib.request.urlopen(f"http://127.0.0.1:{port}{p}").read()  # noqa: E731

        def post(path, body):
            req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"})
            try:
                return urllib.request.urlopen(req).status
            except urllib.error.HTTPError as e:
                return e.code
        assert b"Kitchen video labels" in get("/rows") and b'href="/rows"' in get("/")
        assert json.loads(get("/api/rows/days"))["days"] == ["2026-10-31"]
        ppl = json.loads(get("/api/rows/people?date=2026-10-31"))["people"]
        assert [p["id"] for p in ppl] == [person["id"]]
        for kind in ("thumb", "loop", "frame"):
            assert get(f"/rows/{kind}/2026-10-31/{piece}/32400")[:2] == b"\xff\xd8", kind
        items = [{"piece": piece, "t": 32400}, {"piece": piece, "t": 32405}]
        assert post("/api/rows/label", {"date": "2026-10-31", "items": items, "label": "folding", "by": ""}) == 400  # who is labelling?
        assert post("/api/rows/label", {"date": "2026-10-31", "items": items, "label": "dancing", "by": "Aniket"}) == 400
        assert post("/api/rows/label", {"date": "2026-10-31", "items": items, "label": "folding", "by": "Aniket"}) == 200
        assert post("/api/rows/who", {"date": "2026-10-31", "person": person["id"], "who": "Vijay Das"}) == 200
        assert post("/api/rows/label", {"date": "2026-11-01", "items": items, "label": "folding", "by": "Aniket"}) == 404
        bl = json.loads(get(f"/api/rows/blocks?date=2026-10-31&person={person['id']}"))["blocks"]
        assert [(b["label"], b["by"]) for b in bl] == [("folding", "Aniket"), ("folding", "Aniket"), (None, None)]
        tl = json.loads(get("/api/rows/timeline?date=2026-10-31"))["people"]
        assert tl[0]["who"] == "Vijay Das" and tl[0]["spans"][0][2] == "folding"
    finally:
        server.shutdown()
        server.server_close()

    lines = clips.export(s, "cam-k", say=lambda m: None)
    assert [ln["start"] for ln in lines] == ["09:00:00", "09:00:02", "09:00:04", "09:00:06", "09:00:08"], lines  # 09:00:00-09:00:10 in 2 s steps
    first = os.path.join(root, "clips", lines[0]["path"])
    assert lines[0]["path"] == "folding/cam-k_2026-10-31_09-00-00.0_Vijay-Das.mp4" and os.path.exists(first), lines[0]
    cap = cv2.VideoCapture(first)
    n, size = 0, None
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        n, size = n + 1, fr.shape[:2]
    cap.release()
    assert size == (256, 256) and 18 <= n <= 21, (size, n)
    index = open(os.path.join(root, "clips", "index.csv"), encoding="utf-8").read().splitlines()
    assert index[0].startswith("path,activity,camera,date,start") and len(index) == 6
    db = rows.RowsDB(os.path.join(root, "rows"), "cam-k", "2026-10-31")
    db.set_labels([(piece, 32405)], "idle", "Aniket")  # changed their mind about the second block
    db.close()
    lines = clips.export(s, "cam-k", say=lambda m: None)
    assert sorted((ln["activity"], ln["start"]) for ln in lines) == [("folding", "09:00:00"), ("folding", "09:00:02"), ("idle", "09:00:05"), ("idle", "09:00:07")], lines
    assert not os.path.exists(os.path.join(root, "clips", "folding", "cam-k_2026-10-31_09-00-04.0_Vijay-Das.mp4"))


@test("clip cut: the boxes together, room round them, square, inside the picture")
def _():
    from kai import clips
    assert clips.clip_box([], 1280, 720) is None
    x1, y1, x2, y2 = clips.clip_box([(0.4, 0.2, 0.5, 0.8), (0.45, 0.25, 0.55, 0.85)], 1280, 720)
    assert x2 - x1 == y2 - y1 and 0 <= x1 and x2 <= 1280 and 0 <= y1 and y2 <= 720
    assert x1 <= 0.4 * 1280 and x2 >= 0.55 * 1280 and y1 <= 0.2 * 720
    x1, y1, x2, y2 = clips.clip_box([(0.0, 0.0, 0.2, 1.0)], 1280, 720)  # at the edge, tall: as tall as the picture
    assert (x1, y1, x2, y2) == (0, 0, 720, 720)
    assert clips.starts(0, 10, 6) == [0, 6] and clips.starts(0, 1.5, 2) == []


shutil.rmtree(TMP, ignore_errors=True)
print(f"kitchen-ai: {passed} tests passed")
