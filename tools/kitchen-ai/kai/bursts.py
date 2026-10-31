"""Bunny's burst readings as first labels. The camera watcher keeps every burst with people in it at
<root>\\bursts\\<camera>\\<date>\\HH-MM-SS\\ (01.jpg ... 20.jpg + look.json: the frame times, and for
each person the colour of their top, where they mostly were, and an activity per frame). Bunny says
who by colour, not by box, so each person it describes is matched to a box the person finder drew:
the same (or an easily confused) colour, on the side of the picture Bunny said."""
import itertools
import json
import os

from . import colours

MATCH_MAX = 0.6  # a pairing that costs more than this is not trusted


def burst_folders(bursts_root, cam, date=None):
    base = os.path.join(bursts_root, cam)
    if not os.path.isdir(base):
        return []
    dates = [date] if date else sorted(os.listdir(base))
    out = []
    for d in dates:
        day = os.path.join(base, d)
        if os.path.isdir(day):
            out += [os.path.join(day, b) for b in sorted(os.listdir(day)) if os.path.exists(os.path.join(day, b, "look.json"))]
    return out


def read(folder):
    with open(os.path.join(folder, "look.json"), encoding="utf-8") as f:
        look = json.load(f)
    look["frames"] = sorted(n for n in os.listdir(folder) if n.endswith(".jpg"))
    return look


def side(where):
    """Where in the picture Bunny said someone was: an expected x range, or None."""
    w = (where or "").lower()
    if "left" in w:
        return (0.0, 0.45)
    if "right" in w:
        return (0.55, 1.0)
    if any(k in w for k in ("centre", "center", "middle")):
        return (0.25, 0.75)
    return None


FAR = ("top of", "doorway", "door", "back", "behind", "far")
NEAR = ("bottom", "front", "foreground", "near the camera", "close")


def depth(where):
    """'far' (the top of the picture: the door, the back) or 'near' (the bottom), or None."""
    w = (where or "").lower()
    if any(k in w for k in FAR):
        return "far"
    if any(k in w for k in NEAR):
        return "near"
    return None


def _cost(ai, box_x, box_top, box_y=None):
    c = colours.distance(ai["top"], box_top)
    r = side(ai.get("where"))
    if r and not (r[0] <= box_x <= r[1]):
        c += 0.3
    return c + _depth_cost(ai, box_y)


def _depth_cost(ai, box_y):
    d = depth(ai.get("where"))
    if d is None or box_y is None:
        return 0.0
    return 0.3 if (d == "far" and box_y > 0.5) or (d == "near" and box_y < 0.5) else 0.0


CLEAR_BY = 0.25  # the same number of people on both sides, and the best pairing beats the next by this (one position hint)


def match(ai_people, boxes):
    """ai_people: [{"top", "where"}] seen in this frame; boxes: [(centre x 0-1, top colour, feet y 0-1)].
    Returns {box index: ai index} for the trusted pairs: a good colour match, or - when Bunny and the
    finder count the same people - a pairing the positions settle even where our colour reading
    failed (30 Oct 2026: a seated man in red read as grey, a man against the bright door as blue).
    One of each in the frame always pairs."""
    if not ai_people or not boxes:
        return {}
    if len(ai_people) == 1 and len(boxes) == 1:
        return {0: 0}
    k = min(len(ai_people), len(boxes))
    if max(len(ai_people), len(boxes)) > 7:
        return {}
    scored = []
    for ai_idx in itertools.permutations(range(len(ai_people)), k):
        for box_idx in itertools.combinations(range(len(boxes)), k):
            pairs = list(zip(box_idx, ai_idx))
            scored.append((sum(_cost(ai_people[a], *boxes[b]) for b, a in pairs), pairs))
    scored.sort(key=lambda x: x[0])
    best_cost, best = scored[0]
    clear = len(ai_people) == len(boxes) and (len(scored) == 1 or scored[1][0] - best_cost >= CLEAR_BY)
    return {b: a for b, a in best if clear or _cost(ai_people[a], *boxes[b]) <= MATCH_MAX}


def frame_labels(look, i):
    """The people Bunny saw in frame i (0-based): [(person index, {"top", "where"}, activity, phone)]."""
    out = []
    for n, p in enumerate(look.get("people") or []):
        acts = p.get("activities") or []
        a = acts[i] if i < len(acts) else "away"
        if a == "away":
            continue
        out.append((n, {"top": p.get("top", "other"), "where": p.get("where", "")}, a, (i + 1) in (p.get("phoneFrames") or [])))
    return out
