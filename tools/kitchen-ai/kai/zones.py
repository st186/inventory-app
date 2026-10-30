"""The kitchen's areas, as drawn with tools/cctv/zones.py: %LOCALAPPDATA%\\BunnyCamera\\zones\\<camera>.json
with each zone's points as fractions of the picture. A person is in the zone their feet are in (the
bottom middle of their box); the same name on two cameras is the same place."""
import json
import os

import numpy as np
import cv2

SCALE = 10000  # polygon maths in whole numbers


def load(zones_dir, cam):
    path = os.path.join(zones_dir, f"{cam}.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for z in data.get("zones", []):
        pts = np.array([[round(x * SCALE), round(y * SCALE)] for x, y in z.get("points", [])], np.int32)
        if len(pts) >= 3 and z.get("name"):
            out.append((z["name"], pts))
    return out


def zone_of(zones, x, y):
    """The zone (x, y as 0-1 of the picture) is in, or '' if none. The smallest one wins where two overlap."""
    hit = ""
    best = None
    p = (float(x * SCALE), float(y * SCALE))
    for name, pts in zones:
        if cv2.pointPolygonTest(pts, p, False) >= 0:
            area = cv2.contourArea(pts)
            if best is None or area < best:
                hit, best = name, area
    return hit


def touches(zones, name, box):
    """Whether the lower part of a person's box (x1, y1, x2, y2 as 0-1) reaches into the named zone:
    someone working at a table stands beside it, so their feet can be just outside it."""
    polys = [pts for n, pts in zones if n == name]
    if not polys:
        return False
    x1, y1, x2, y2 = box
    for fx in (0.1, 0.5, 0.9):
        for fy in (0.4, 0.7, 1.0):
            p = (float((x1 + (x2 - x1) * fx) * SCALE), float((y1 + (y2 - y1) * fy) * SCALE))
            if any(cv2.pointPolygonTest(pts, p, False) >= 0 for pts in polys):
                return True
    return False


def names(zones):
    return sorted({n for n, _ in zones})
