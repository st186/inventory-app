"""The labelled stretches of the video rows (kai/rows.py) as 2-second clips of one person, a folder
per activity - what a video model (SlowFast, V-JEPA) learns from:

    <root>\\clips\\<activity>\\<camera>_<date>_<HH-MM-SS.s>_<who>.mp4     256 x 256, every frame (~20 a second)
    <root>\\clips\\index.csv                                                one line per clip, every day

Each clip is cut round the person's boxes over those 2 seconds (all of them together, so their
movement stays in the picture), with room on every side for the table or machine they work at, made
square. A clip starts every `clip_every_s` seconds of a stretch (6 by default): next-door clips of
one long stretch look alike, and a model learns more from many different stretches. Running it again
makes what's missing and removes clips whose label was changed or cleared."""
import csv
import glob
import os
import shutil
import subprocess
from datetime import datetime, timedelta

import cv2

from . import video
from .rows import RowsDB, clock
from .store import NOT_A_PERSON

CLIP_S = 2.0
ROOM = 0.2    # each side, as a share of the box
SIZE = 256


def find_ffmpeg():
    found = shutil.which("ffmpeg")
    if found:
        return found
    hits = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg*", "*", "bin", "ffmpeg.exe"))
    return hits[0] if hits else None


def clip_box(boxes, w, h):
    """The square cut (pixels) round a person's boxes (0-1) over a clip, with ROOM on each side, kept
    inside the picture; None without boxes."""
    if not boxes:
        return None
    x1, y1 = min(b[0] for b in boxes) * w, min(b[1] for b in boxes) * h
    x2, y2 = max(b[2] for b in boxes) * w, max(b[3] for b in boxes) * h
    bw, bh = x2 - x1, y2 - y1
    x1, x2, y1, y2 = x1 - ROOM * bw, x2 + ROOM * bw, y1 - ROOM * bh, y2 + ROOM * bh
    side = min(max(x2 - x1, y2 - y1), w, h)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    left = min(max(0, cx - side / 2), w - side)
    top = min(max(0, cy - side / 2), h - side)
    return int(left), int(top), int(left + side), int(top + side)


def starts(t0, t1, every):
    """Clip start times inside a stretch."""
    out, t = [], t0
    while t + CLIP_S <= t1 + 1e-6:
        out.append(round(t, 2))
        t += every
    return out


def _slug(text):
    return "".join(ch if ch.isalnum() else "-" for ch in text).strip("-") or "x"


def name_of(cam, date, t, who, person):
    return f"{cam}_{date}_{clock(t).replace(':', '-')}.{int(round(t * 10)) % 10}_{_slug(who) if who else f'person{person}'}.mp4"


def write_clip(path, frames, fps, ffmpeg):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part.mp4"
    if ffmpeg:
        p = subprocess.Popen([ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{SIZE}x{SIZE}", "-r", f"{fps:.3f}", "-i", "-",
                              "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", tmp],
                             stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for f in frames:
            p.stdin.write(f.tobytes())
        p.stdin.close()
        if p.wait() != 0:
            raise RuntimeError(f"ffmpeg could not write {path}")
    else:
        vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (SIZE, SIZE))
        for f in frames:
            vw.write(f)
        vw.release()
    os.replace(tmp, path)


def export_day(s, cam, date, every=None, say=print):
    """A day's labelled stretches as clips (what's there already is kept). Returns the day's index lines."""
    every = every or s.clip_every_s
    out_root = os.path.join(s.root, "clips")
    db = RowsDB(os.path.join(s.root, "rows"), cam, date)
    try:
        wanted = []
        for st in db.stretches():
            if st["label"] == NOT_A_PERSON:
                continue
            for t in starts(st["t0"], st["t1"], every):
                rel = os.path.join(st["label"], name_of(cam, date, t, st["who"], st["person"]))
                wanted.append((rel, t, st))
        keep = {w[0] for w in wanted}
        removed = 0
        for f in glob.glob(os.path.join(out_root, "*", f"{cam}_{date}_*.mp4")):
            if os.path.relpath(f, out_root) not in keep:
                os.remove(f)
                removed += 1
        day_pieces = video.pieces(s.recordings, cam, date)
        midnight = datetime.strptime(date, "%Y-%m-%d")
        ffmpeg = find_ffmpeg()
        lines, made = [], 0
        for rel, t, st in wanted:
            boxes = [b for _, b in db.boxes(st["piece"], t, t + CLIP_S)]
            path = os.path.join(out_root, rel)
            if not boxes:
                continue
            if not os.path.exists(path):
                frames = video.read_span(day_pieces, midnight + timedelta(seconds=t), CLIP_S)
                if len(frames) < 2:
                    continue
                h, w = frames[0][1].shape[:2]
                x1, y1, x2, y2 = clip_box(boxes, w, h)
                cut = [cv2.resize(f[y1:y2, x1:x2], (SIZE, SIZE), interpolation=cv2.INTER_AREA) for _, f in frames]
                fps = next(p.fps for p in day_pieces if p.start <= frames[0][0] < p.end)
                write_clip(path, cut, fps, ffmpeg)
                made += 1
            bx = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
            lines.append({"path": rel.replace("\\", "/"), "activity": st["label"], "camera": cam, "date": date, "start": clock(t),
                          "start_s": t, "seconds": CLIP_S, "person": st["person"], "who": st["who"] or "", "labelled_by": st["by"] or "",
                          "x1": bx[0], "y1": bx[1], "x2": bx[2], "y2": bx[3]})
        say(f"clips {date}: {made} made, {removed} removed, {len(lines)} in all")
        return lines
    finally:
        db.close()


INDEX_COLS = ["path", "activity", "camera", "date", "start", "start_s", "seconds", "person", "who", "labelled_by", "x1", "y1", "x2", "y2"]


def export(s, cam, say=print):
    """Clips for every day with rows (only what's missing is cut), then the index (clips/index.csv) written again."""
    lines = []
    for d in RowsDB.days(os.path.join(s.root, "rows"), cam):
        lines += export_day(s, cam, d, say=say)
    os.makedirs(os.path.join(s.root, "clips"), exist_ok=True)
    with open(os.path.join(s.root, "clips", "index.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, INDEX_COLS)
        wr.writeheader()
        wr.writerows(lines)
    per = {}
    for ln in lines:
        per[ln["activity"]] = per.get(ln["activity"], 0) + 1
    say("clips in all: " + (", ".join(f"{a} {n}" for a, n in sorted(per.items(), key=lambda x: -x[1])) or "none yet"))
    return lines
