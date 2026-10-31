"""One look at the kitchen: every person in a frame, with what the model needs to judge what they're
doing - the 384 picture numbers of their crop, how much they moved in the next second, the zone
their feet are in, whether a phone is in their box, and the colour of their top (to know who it is)."""
from dataclasses import dataclass

import numpy as np
import cv2

from . import colours, zones as zone_mod
from .models import PERSON, PHONE
from .video import fit_width

MARGIN = 0.08       # crop a little round the box: the hands and what they hold
MIN_HEIGHT = 0.08   # boxes smaller than this share of the picture are left out
MOVE_DIFF = 25      # grey-level change that counts as a moved pixel


@dataclass
class Person:
    box: tuple          # x1, y1, x2, y2 as 0-1 of the picture
    score: float
    top: str
    zone: str
    phone: bool
    motion: float       # mean change in the box over the next second (None = no second frame)
    moving: float       # share of the box that changed
    feat: np.ndarray    # 384 float32
    crop: np.ndarray    # BGR, for the labelling page


def _motion(a, b, box):
    x1, y1, x2, y2 = map(int, box)
    pa, pb = a[y1:y2, x1:x2], b[y1:y2, x1:x2]
    if pa.size == 0 or pa.shape != pb.shape:
        return None, None
    ga = cv2.cvtColor(cv2.resize(pa, (64, 128)), cv2.COLOR_BGR2GRAY).astype(np.int16)
    gb = cv2.cvtColor(cv2.resize(pb, (64, 128)), cv2.COLOR_BGR2GRAY).astype(np.int16)
    d = np.abs(ga - gb)
    return float(d.mean()), float((d > MOVE_DIFF).mean())


class Looker:
    def __init__(self, finder, reader, zones=(), width=1280, min_score=0.45):
        self.finder, self.reader, self.zones = finder, reader, list(zones)
        self.width, self.min_score = width, min_score

    def look(self, frame, later=None):
        frame = fit_width(frame, self.width)
        if later is not None:
            later = fit_width(later, self.width)
        h, w = frame.shape[:2]
        found = self.finder.find(frame, min_score=min(self.min_score, 0.3))
        people = [f for f in found if f[5] == PERSON and f[4] >= self.min_score and (f[3] - f[1]) / h >= MIN_HEIGHT]
        phones = [f for f in found if f[5] == PHONE]
        crops, keep = [], []
        for x1, y1, x2, y2, score, _ in people:
            mx, my = (x2 - x1) * MARGIN, (y2 - y1) * MARGIN
            c = frame[int(max(0, y1 - my)):int(min(h, y2 + my)), int(max(0, x1 - mx)):int(min(w, x2 + mx))]
            if c.size:
                crops.append(c)
                keep.append((x1, y1, x2, y2, score))
        feats = self.reader.read(crops)
        out = []
        for (x1, y1, x2, y2, score), crop, feat in zip(keep, crops, feats):
            motion, moving = _motion(frame, later, (x1, y1, x2, y2)) if later is not None else (None, None)
            phone = any(x1 <= (p[0] + p[2]) / 2 <= x2 and y1 <= (p[1] + p[3]) / 2 <= y2 for p in phones)
            out.append(Person(
                box=(x1 / w, y1 / h, x2 / w, y2 / h), score=score,
                top=colours.top_colour(frame, (x1, y1, x2, y2)),
                zone=zone_mod.zone_of(self.zones, (x1 + x2) / 2 / w, y2 / h),
                phone=phone, motion=motion, moving=moving, feat=feat, crop=crop,
            ))
        return frame, out
