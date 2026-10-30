"""Frames out of the recordings that tools/cctv/recorder.py makes:
<recordings>\\<camera>\\<date>\\HH-MM-SS.mp4, 30-minute pieces named by the time they start (PC clock).
A piece still being recorded can't be opened yet (an mp4 is finished when it closes), so it is
left out until it is done."""
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

import cv2

PIECE = re.compile(r"^(\d\d)-(\d\d)-(\d\d)\.mp4$")
MOTION_GAP_S = 1.0  # the second frame, for how much someone moved, is this much later


@dataclass
class Piece:
    path: str
    start: datetime
    seconds: float
    fps: float

    @property
    def end(self):
        return self.start + timedelta(seconds=self.seconds)


def pieces(recordings, cam, date):
    """The finished pieces of one camera's day, in order."""
    folder = os.path.join(recordings, cam, date)
    out = []
    if not os.path.isdir(folder):
        return out
    day = datetime.strptime(date, "%Y-%m-%d")
    for name in sorted(os.listdir(folder)):
        m = PIECE.match(name)
        if not m:
            continue
        path = os.path.join(folder, name)
        cap = cv2.VideoCapture(path, cv2.CAP_FFMPEG)
        try:
            if not cap.isOpened():
                continue
            fps = cap.get(cv2.CAP_PROP_FPS) or 0
            frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        finally:
            cap.release()
        if fps <= 0 or frames <= 0:
            continue
        start = day.replace(hour=int(m[1]), minute=int(m[2]), second=int(m[3]))
        out.append(Piece(path, start, frames / fps, fps))
    return out


def fit_width(frame, width):
    """Every frame is looked at the same width, whatever the stream (the model learns at one size)."""
    h, w = frame.shape[:2]
    if w == width:
        return frame
    return cv2.resize(frame, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)


def _read_pair(cap, fps):
    ok, first = cap.read()
    if not ok:
        return None, None
    later = None
    for _ in range(max(1, round(fps * MOTION_GAP_S)) - 1):
        if not cap.grab():
            break
    ok, f = cap.read()
    if ok:
        later = f
    return first, later


def sample(piece, every_s, offset_s=0.0):
    """(time, frame, frame a second later or None) every `every_s` seconds through a piece."""
    cap = cv2.VideoCapture(piece.path, cv2.CAP_FFMPEG)
    try:
        t = offset_s
        while t < piece.seconds - 0.5:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            first, later = _read_pair(cap, piece.fps)
            if first is None:
                break
            yield piece.start + timedelta(seconds=t), first, later
            t += every_s
    finally:
        cap.release()


def frame_at(day_pieces, when):
    """The recorded frame at `when` (and one a second later), or (None, None) if it wasn't recorded."""
    for p in day_pieces:
        if p.start <= when < p.end:
            cap = cv2.VideoCapture(p.path, cv2.CAP_FFMPEG)
            try:
                cap.set(cv2.CAP_PROP_POS_MSEC, (when - p.start).total_seconds() * 1000)
                return _read_pair(cap, p.fps)
            finally:
                cap.release()
    return None, None
