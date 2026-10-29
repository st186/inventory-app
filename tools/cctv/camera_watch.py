"""Bunny Momos camera watcher (owner, 29 Oct 2026).

Runs on a PC on the same Wi-Fi (2.4 GHz) as a Tapo camera and talks to the Bunny server (cctv.ts):
  - in working hours: one still every N minutes (the server's setting), checked for cap, gloves
    and apron;
  - outside them: watches the camera's small stream for movement and sends a still when something
    moves; the server's AI says whether anyone is there and raises the "after hours" alert.
The server keeps the schedule, the working hours and the AI budget; this only grabs pictures.

Settings: %LOCALAPPDATA%\\BunnyCamera\\camera_watch.ini (never in the project folder - it holds
the camera's password and key). Log: camera_watch.log next to it.
Needs Python 3 with OpenCV (cv2). Run:  pythonw camera_watch.py   (no window)
"""
import base64
import configparser
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

import cv2

HOME = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "BunnyCamera")
CONFIG = os.path.join(HOME, "camera_watch.ini")
LOG = os.path.join(HOME, "camera_watch.log")

MOTION_SHARE = 0.015      # share of the small frame that must change to count as movement
MOTION_FRAMES = 3         # ...in this many samples in a row (about 1.5 s)
MOTION_COOLDOWN_S = 120   # after sending a movement still, wait this long before the next
CONFIG_EVERY_S = 900      # ask the server what to do at least this often


def log(msg):
    os.makedirs(HOME, exist_ok=True)
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 2_000_000:
            os.replace(LOG, LOG + ".old")
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    if sys.stdout:
        print(line, flush=True)


def load_settings():
    cp = configparser.ConfigParser()
    if not cp.read(CONFIG, encoding="utf-8"):
        sys.exit(f"No settings file at {CONFIG}")
    s = {
        "server": cp.get("server", "url").rstrip("/"),
        "id": cp.get("camera", "id"),
        "key": cp.get("camera", "key"),
        "still_url": cp.get("camera", "still_url"),
        "watch_url": cp.get("camera", "watch_url"),
    }
    if "PASSWORD" in s["still_url"] or "PASSWORD" in s["watch_url"]:
        sys.exit("Put the camera account's name and password into still_url and watch_url in " + CONFIG)
    return s


def call(s, path, body=None):
    req = urllib.request.Request(
        s["server"] + path,
        data=json.dumps(body).encode() if body is not None else None,
        method="POST" if body is not None else "GET",
        headers={"Content-Type": "application/json", "X-Camera-Id": s["id"], "X-Camera-Key": s["key"]},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode()).get("error", "")
        except Exception:
            detail = ""
        log(f"server said {e.code} {detail}")
        if e.code == 401:
            time.sleep(600)  # wrong key: don't hammer the server
        return None
    except Exception as e:
        log(f"server not reachable: {type(e).__name__}")
        return None


def grab_still(url):
    """One fresh full-size frame as base64 JPEG (or None)."""
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    try:
        if not cap.isOpened():
            log("camera not reachable (check the Wi-Fi band, the address and the camera account)")
            return None
        frame = None
        for _ in range(12):  # skip the first frames so the picture is current and complete
            ok, f = cap.read()
            if ok:
                frame = f
        if frame is None:
            log("camera sent no picture")
            return None
        h, w = frame.shape[:2]
        if w > 1280:
            frame = cv2.resize(frame, (1280, int(h * 1280 / w)))
        ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(jpg.tobytes()).decode() if ok else None
    finally:
        cap.release()


def send_still(s, kind):
    image = grab_still(s["still_url"])
    if not image:
        return None
    res = call(s, "/cctv/frame", {"kind": kind, "image": image})
    if res:
        if res.get("skipped"):
            log(f"{kind} still skipped: {res['skipped']}")
        else:
            log(f"{kind} still checked: {res.get('peopleCount')} in view, missing {res.get('missing') or 'nothing'}, alert {res.get('alert') or 'none'}")
    return res


def watch_for_movement(s, seconds):
    """Watches the small stream for up to `seconds`; sends a still when something moves."""
    end = time.time() + seconds
    cap = cv2.VideoCapture(s["watch_url"], cv2.CAP_FFMPEG)
    if not cap.isOpened():
        log("small stream not reachable; trying again in a minute")
        time.sleep(60)
        return
    log("watching for movement (outside working hours)")
    prev, streak, last_sent = None, 0, 0.0
    try:
        while time.time() < end:
            ok, frame = cap.read()
            if not ok:
                log("small stream dropped; reconnecting")
                break
            small = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(frame, (320, 180)), cv2.COLOR_BGR2GRAY), (7, 7), 0)
            if prev is not None:
                diff = cv2.threshold(cv2.absdiff(prev, small), 25, 255, cv2.THRESH_BINARY)[1]
                share = cv2.countNonZero(diff) / diff.size
                streak = streak + 1 if share > MOTION_SHARE else 0
                if streak >= MOTION_FRAMES and time.time() - last_sent > MOTION_COOLDOWN_S:
                    log(f"movement ({share:.1%} of the picture)")
                    cap.release()
                    send_still(s, "motion")
                    last_sent, streak, prev = time.time(), 0, None
                    cap = cv2.VideoCapture(s["watch_url"], cv2.CAP_FFMPEG)
                    continue
            prev = small
            # About 2 samples a second is plenty; skip the frames in between.
            for _ in range(6):
                cap.grab()
    finally:
        cap.release()


def main():
    s = load_settings()
    log("camera watcher started")
    plan, plan_at = None, 0.0
    while True:
        if not plan or time.time() - plan_at > CONFIG_EVERY_S:
            got = call(s, "/cctv/config")
            if got:
                plan, plan_at = got, time.time()
            elif not plan:
                time.sleep(60)
                continue
        if not plan.get("active"):
            log("camera paused in the app")
            time.sleep(600)
            plan = None
            continue
        if plan.get("working"):
            wait = max(0, int(plan.get("nextStillInSec", 0)))
            if wait > 0:
                time.sleep(min(wait, CONFIG_EVERY_S))
                plan = None  # ask again: hours or settings may have changed
                continue
            res = send_still(s, "scheduled")
            plan, plan_at = (res, time.time()) if res and "working" in res else (None, 0.0)
            if not res:
                time.sleep(120)
        else:
            watch_for_movement(s, min(max(60, int(plan.get("nextStillInSec", 900))), CONFIG_EVERY_S))
            plan = None


if __name__ == "__main__":
    # Keeps going through anything unexpected (a camera that drops, a bad frame): log it, wait a
    # minute, start again. A missing or unfilled settings file stops it (sys.exit).
    while True:
        try:
            main()
        except KeyboardInterrupt:
            log("stopped")
            break
        except SystemExit as e:
            log(f"not running: {e}")
            break
        except Exception as e:
            log(f"error, restarting in a minute: {type(e).__name__}: {e}")
            time.sleep(60)
