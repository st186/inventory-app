"""Following people from one look to the next (a few seconds apart), so one person's minutes are added
up as one: the box that overlaps most, or the nearest one wearing the same colour."""
from dataclasses import dataclass, field


def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _centre(b):
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


@dataclass
class _Track:
    id: int
    box: tuple
    top: str
    missed: int = 0
    tops: dict = field(default_factory=dict)


class Tracker:
    def __init__(self, min_iou=0.15, max_move=0.18, max_missed=3):
        self.min_iou, self.max_move, self.max_missed = min_iou, max_move, max_missed
        self.tracks = []
        self.next_id = 1

    def update(self, boxes, tops):
        """boxes as 0-1 fractions (x1, y1, x2, y2); returns a track id for each box."""
        pairs = []
        for i, b in enumerate(boxes):
            for t in self.tracks:
                o = iou(b, t.box)
                (bx, by), (tx, ty) = _centre(b), _centre(t.box)
                move = ((bx - tx) ** 2 + (by - ty) ** 2) ** 0.5
                same = tops[i] == t.top
                if o >= self.min_iou or (move <= self.max_move and same):
                    pairs.append((o + (0.3 if same else 0) - move, i, t))
        pairs.sort(key=lambda p: -p[0])
        ids = [None] * len(boxes)
        used = set()
        for _, i, t in pairs:
            if ids[i] is not None or t.id in used:
                continue
            ids[i] = t.id
            used.add(t.id)
            t.box, t.top, t.missed = boxes[i], tops[i], 0
            t.tops[tops[i]] = t.tops.get(tops[i], 0) + 1
        for t in self.tracks:
            if t.id not in used:
                t.missed += 1
        self.tracks = [t for t in self.tracks if t.missed <= self.max_missed]
        for i, b in enumerate(boxes):
            if ids[i] is None:
                t = _Track(self.next_id, b, tops[i], tops={tops[i]: 1})
                self.next_id += 1
                self.tracks.append(t)
                ids[i] = t.id
        return ids
