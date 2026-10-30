"""Who is who on the kitchen camera, worked out on the PC (owner, 30 Oct 2026: two men in red tops
were one person to Bunny, and trouser colours in words came out blue / navy / black for the same
jeans). Every person in a burst gets a box from the person finder and a number for the day: the
same number every time they're seen, matched by how they look as a whole - the picture reader's 384
numbers for the person plus the colours of their top half and bottom half. Bunny then only says what
person 1, 2, 3... is doing, and the owner names each number once a day on a photo with their box.

When unsure it gives a new number rather than a wrong one: two numbers for one person just means the
same name is picked twice; one number for two people would mix their minutes."""
import json
import os
from dataclasses import dataclass, field

import numpy as np
import cv2

from .models import PERSON
from .video import fit_width

MIN_HEIGHT = 0.08        # boxes smaller than this share of the picture are left out
MIN_SCORE = 0.30        # low enough for someone seated at the back or cut off by the frame edge (Bunny drops non-people)
SAME_IN_BURST = 0.55     # how alike two boxes 15 s apart must look to be one person
SAME_IN_DAY = 0.70       # how alike a burst's person must look to one of the day's examples of someone
COLOUR_GATE = 0.72       # ...and their clothing colours at least this alike (yellow never matches red)
MOVE_PENALTY = 0.35      # per picture-width moved between frames, within a burst
DINO_WEIGHT = 0.35       # the rest is the clothing colours: within a day the clothes say most
EXAMPLES = 24            # looks kept per person: matched against each, not a drifting average
TAG_COLOURS = [(0, 140, 255), (255, 120, 0), (60, 200, 60), (200, 60, 200), (0, 200, 220), (220, 220, 0), (120, 80, 255), (255, 60, 120)]


HUE_BINS, GREY_BINS = 18, 6
COL_LEN = 2 * (HUE_BINS + GREY_BINS)


def _hist(patch):
    """Colours of one part of a person as a unit vector: the hues of its clearly coloured pixels (red,
    yellow, blue...) and the brightness of the rest (white, grey, black), weighted by how much of each.
    Washed-out pixels, shadows and skin don't swamp the top's colour this way."""
    if patch.size == 0:
        return np.zeros(HUE_BINS + GREY_BINS, np.float32)
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(np.float32)
    coloured = (hsv[:, 1] >= 70) & (hsv[:, 2] >= 60)
    share = coloured.mean()
    hue = np.bincount((hsv[coloured, 0] * HUE_BINS / 180).astype(int).clip(0, HUE_BINS - 1), minlength=HUE_BINS).astype(np.float32)
    grey = np.bincount((hsv[~coloured, 2] * GREY_BINS / 256).astype(int).clip(0, GREY_BINS - 1), minlength=GREY_BINS).astype(np.float32)
    v = np.concatenate([share * hue / max(hue.sum(), 1), (1 - share) * grey / max(grey.sum(), 1)])
    v = np.sqrt(v)  # Hellinger
    return v / (np.linalg.norm(v) + 1e-9)


def colours_of(frame, box):
    """Colours of the middle of the person's top and of their trousers (box in pixels): the centre
    half of the box's width, so the background beside them stays out."""
    x1, y1, x2, y2 = map(int, box)
    h, w = y2 - y1, x2 - x1
    cx1, cx2 = x1 + int(0.25 * w), x2 - int(0.25 * w)
    top = frame[y1 + int(0.2 * h): y1 + int(0.5 * h), cx1:cx2]
    bottom = frame[y1 + int(0.58 * h): y1 + int(0.9 * h), cx1:cx2]
    return np.concatenate([_hist(top), _hist(bottom)]) / np.sqrt(2)


def similarity(a, b):
    """0-1: how alike two people look (picture numbers and clothing colours)."""
    dino = float(np.dot(a["dino"], b["dino"]))
    col = float(np.dot(a["col"], b["col"]))
    return DINO_WEIGHT * dino + (1 - DINO_WEIGHT) * col


@dataclass
class Seen:
    frame: int
    box: tuple   # pixels in the frame as looked at (fit_width)
    score: float
    dino: np.ndarray
    col: np.ndarray


@dataclass
class Person:
    id: int
    dino: np.ndarray   # examples, one row each
    col: np.ndarray
    n: int = 0
    first: str = ""
    last: str = ""

    def take(self, looks, when):
        """Add this burst's looks as examples (the newest EXAMPLES kept)."""
        self.dino = np.vstack([self.dino.reshape(-1, 384), *[lk["dino"][None] for lk in looks]])[-EXAMPLES:]
        self.col = np.vstack([self.col.reshape(-1, COL_LEN), *[lk["col"][None] for lk in looks]])[-EXAMPLES:]
        self.n += len(looks)
        self.last = when

    def match(self, look):
        """How alike a look is to this person: the best of their examples whose colours pass the gate."""
        cols = self.col @ look["col"]
        ok = cols >= COLOUR_GATE
        if not ok.any():
            return 0.0
        sims = DINO_WEIGHT * (self.dino @ look["dino"]) + (1 - DINO_WEIGHT) * cols
        return float(sims[ok].max())


def _pairs(sim):
    """Greedy best-first pairing of a similarity matrix: [(row, col, sim)]."""
    out, used_r, used_c = [], set(), set()
    flat = sorted(((sim[r, c], r, c) for r in range(sim.shape[0]) for c in range(sim.shape[1])), reverse=True)
    for s, r, c in flat:
        if r in used_r or c in used_c:
            continue
        out.append((r, c, s))
        used_r.add(r)
        used_c.add(c)
    return out


class DayPeople:
    """The people seen on one camera today, kept on disk so a restart doesn't renumber them."""

    def __init__(self, folder, cam, date, finder, reader, width=1280):
        self.path = os.path.join(folder, cam, f"{date}.npz")
        self.finder, self.reader, self.width = finder, reader, width
        self.people: list[Person] = []
        if os.path.exists(self.path):
            z = np.load(self.path)
            for m in json.loads(str(z["meta"])):
                self.people.append(Person(m["id"], z[f"dino_{m['id']}"], z[f"col_{m['id']}"], m["n"], m["first"], m["last"]))

    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        meta = [{"id": p.id, "n": p.n, "first": p.first, "last": p.last} for p in self.people]
        arrays = {}
        for p in self.people:
            arrays[f"dino_{p.id}"] = p.dino
            arrays[f"col_{p.id}"] = p.col
        np.savez(self.path, meta=json.dumps(meta), **arrays)

    def _find(self, frames):
        seen = []
        for f, frame in enumerate(frames):
            h = frame.shape[0]
            boxes = [b for b in self.finder.find(frame, min_score=MIN_SCORE, classes=(PERSON,)) if (b[3] - b[1]) / h >= MIN_HEIGHT]
            crops = [frame[int(b[1]):int(b[3]), int(b[0]):int(b[2])] for b in boxes]
            feats = self.reader.read(crops) if crops else []
            for b, d in zip(boxes, feats):
                seen.append(Seen(f, tuple(b[:4]), b[4], d, colours_of(frame, b[:4])))
        return seen

    def _tracks(self, seen, n_frames, width):
        """People followed through the burst: lists of Seen."""
        tracks: list[list[Seen]] = []
        for f in range(n_frames):
            now = [s for s in seen if s.frame == f]
            live = [t for t in tracks if f - t[-1].frame <= 4]  # gone a minute: a new walk-in
            if live and now:
                sim = np.zeros((len(now), len(live)))
                for i, s in enumerate(now):
                    for j, t in enumerate(live):
                        last = t[-1]
                        move = abs((s.box[0] + s.box[2]) - (last.box[0] + last.box[2])) / 2 / width
                        col = float(np.dot(s.col, last.col))
                        sim[i, j] = -1 if col < COLOUR_GATE - 0.12 else similarity({"dino": s.dino, "col": s.col}, {"dino": last.dino, "col": last.col}) - MOVE_PENALTY * move
                taken = set()
                for i, j, v in _pairs(sim):
                    if v >= SAME_IN_BURST:
                        live[j].append(now[i])
                        taken.add(i)
                now = [s for i, s in enumerate(now) if i not in taken]
            tracks += [[s] for s in now]
        return tracks

    def label(self, frames, when):
        """Number the people in a burst. Returns (frames looked at, per frame [{"id", "box"}] with box
        as 0-1 of the picture, {id: index of their clearest Seen}, the Seen list per id)."""
        frames = [fit_width(f, self.width) for f in frames]
        h, w = frames[0].shape[:2]
        seen = self._find(frames)
        tracks = self._tracks(seen, len(frames), w)
        # Each track as one look (its mean), plus a few of its single frames as extra examples.
        unit = lambda v: v / (np.linalg.norm(v) + 1e-9)  # noqa: E731
        looks, extras = [], []
        for t in tracks:
            looks.append({"dino": unit(np.mean([s.dino for s in t], axis=0)), "col": unit(np.mean([s.col for s in t], axis=0))})
            step = max(1, len(t) // 3)
            extras.append([{"dino": s.dino, "col": s.col} for s in t[::step][:3]])
        ids = [None] * len(tracks)
        if self.people and looks:
            sim = np.array([[p.match(lk) for p in self.people] for lk in looks])
            for i, j, v in _pairs(sim):
                if v >= SAME_IN_DAY:
                    ids[i] = self.people[j].id
        for i, lk in enumerate(looks):
            if ids[i] is None:
                new = Person(max([p.id for p in self.people], default=0) + 1, np.zeros((0, 384), np.float32), np.zeros((0, COL_LEN), np.float32), 0, when, when)
                self.people.append(new)
                ids[i] = new.id
            next(p for p in self.people if p.id == ids[i]).take([lk, *extras[i]], when)
        per_frame = [[] for _ in frames]
        by_id: dict[int, list[Seen]] = {}
        for pid, t in zip(ids, tracks):
            for s in t:
                x1, y1, x2, y2 = s.box
                per_frame[s.frame].append({"id": pid, "box": [round(x1 / w, 4), round(y1 / h, 4), round(x2 / w, 4), round(y2 / h, 4)]})
            by_id.setdefault(pid, []).extend(t)
        self.save()
        return frames, per_frame, by_id


class BurstNumbers(DayPeople):
    """People numbered within one burst only (1, 2, 3... by first appearance, left to right): the boxes
    the PC draws on the frames it sends. Who each number is across the day is Bunny's job, from
    reference photos of today's people (cctv.ts) - better at "same hairnet, same red shirt" than colour
    counting in a crowded, top-down view (30 Oct 2026 trial: colour matching mixed people up)."""

    def __init__(self, finder, reader, width=1280):
        self.finder, self.reader, self.width = finder, reader, width
        self.people = []

    def number(self, frames):
        """Returns (frames as looked at, per frame [{"n", "box" 0-1}], {n: (frame index, box in pixels)}
        - each number's clearest look, for its photo)."""
        frames = [fit_width(f, self.width) for f in frames]
        h, w = frames[0].shape[:2]
        tracks = self._tracks(self._find(frames), len(frames), w)
        # A box seen once with a low score is more likely a mistake than a person.
        tracks = [t for t in tracks if len(t) >= 2 or t[0].score >= 0.6]
        tracks.sort(key=lambda t: (t[0].frame, t[0].box[0]))
        per_frame = [[] for _ in frames]
        best = {}
        for n, t in enumerate(tracks, 1):
            for s in t:
                x1, y1, x2, y2 = s.box
                per_frame[s.frame].append({"n": n, "box": [round(x1 / w, 4), round(y1 / h, 4), round(x2 / w, 4), round(y2 / h, 4)]})
            clear = max(t, key=lambda s: (s.box[2] - s.box[0]) * (s.box[3] - s.box[1]) * s.score)
            best[n] = (clear.frame, clear.box)
        return frames, per_frame, best


def crop_of(frame, box, max_h=256):
    """One person cut out, small: the reference photo Bunny compares later bursts against."""
    x1, y1, x2, y2 = map(int, box)
    c = frame[max(0, y1):y2, max(0, x1):x2]
    if c.size and c.shape[0] > max_h:
        c = cv2.resize(c, (max(1, round(c.shape[1] * max_h / c.shape[0])), max_h), interpolation=cv2.INTER_AREA)
    return c


def draw_numbers(frame, people, thick=2, label=True):
    """Each person's box and number on a copy of the frame (people: [{"n" or "id", "box" 0-1}])."""
    out = frame.copy()
    h, w = out.shape[:2]
    for p in people:
        x1, y1, x2, y2 = (int(p["box"][0] * w), int(p["box"][1] * h), int(p["box"][2] * w), int(p["box"][3] * h))
        num = p.get("n", p.get("id"))
        col = TAG_COLOURS[(num - 1) % len(TAG_COLOURS)]
        cv2.rectangle(out, (x1, y1), (x2, y2), col, thick)
        if not label:
            continue
        text = str(num)
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.9, 2)
        cv2.rectangle(out, (x1, y1), (x1 + tw + 10, y1 + th + 10), col, -1)
        cv2.putText(out, text, (x1 + 5, y1 + th + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2, cv2.LINE_AA)
    return out


def who_photo(frame, person, width=640):
    """The frame with only this person's box, bold and unnumbered (their day number comes from the
    server) - the photo to put a name to."""
    out = draw_numbers(frame, [person], thick=4, label=False)
    h, w = out.shape[:2]
    return cv2.resize(out, (width, round(h * width / w)), interpolation=cv2.INTER_AREA) if w > width else out
