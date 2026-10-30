"""Bunny Momos camera watcher (owner, 29 Oct 2026).

Runs on a PC on the same Wi-Fi (2.4 GHz) as a Tapo camera and talks to the Bunny server (cctv.ts):
  - in working hours: one still every N minutes (the server's setting), checked for cap, gloves
    and apron; a kitchen-activity camera instead takes a burst - 20 frames 15 seconds apart, sent
    together - then waits N minutes;
  - outside them: watches the camera's small stream for movement and sends a still when something
    moves; the server's AI says whether anyone is there and raises the "after hours" alert.
The server keeps the schedule, the working hours and the AI budget; this only grabs pictures.
With the kitchen model set up (tools/kitchen-ai, owner 30 Oct 2026), a burst's people are found here
and a numbered box drawn round each before it goes, with a small crop and a photo of each: the server
then keeps everyone under one number all day. Without it, bursts go as before.

Settings: %LOCALAPPDATA%\\BunnyCamera\\camera_watch.ini (never in the project folder - it holds
the camera's password and key): a [server] section, then one [camera] section, or several named
[camera:<anything>] sections (one PC watching all of a place's cameras, each in its own thread).
Log: camera_watch.log next to it. Needs Python 3 with OpenCV (cv2). Run:  pythonw camera_watch.py
"""
import base64
import configparser
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

import cv2

try:  # face recognition (faces.py): optional - stills go without names until it is set up
    import faces as face_book
except Exception:  # noqa: BLE001
    face_book = None

HOME = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "BunnyCamera")
KITCHEN_AI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "kitchen-ai")
CONFIG = os.path.join(HOME, "camera_watch.ini")
LOG = os.path.join(HOME, "camera_watch.log")

MOTION_SHARE = 0.015      # share of the small frame that must change to count as movement
MOTION_FRAMES = 3         # ...in this many samples in a row (about 1.5 s)
MOTION_COOLDOWN_S = 120   # after sending a movement still, wait this long before the next
CONFIG_EVERY_S = 900      # ask the server what to do at least this often


_log_lock = threading.Lock()
_face_lock = threading.Lock()  # one face model, shared by the camera threads
_numbers_lock = threading.Lock()  # one person finder too
_numbers = None  # kitchen-ai's BurstNumbers, loaded on first use; False when it can't be


def log(msg, cam=None):
    os.makedirs(HOME, exist_ok=True)
    who = f"[{cam['id']}] " if cam and cam.get("many") else ""
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {who}{msg}"
    with _log_lock:
        _write(line)


def _write(line):
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
    """The cameras in the settings file: [camera], or [camera:...] sections."""
    cp = configparser.ConfigParser()
    if not cp.read(CONFIG, encoding="utf-8"):
        sys.exit(f"No settings file at {CONFIG}")
    server = cp.get("server", "url").rstrip("/")
    sections = [sec for sec in cp.sections() if sec == "camera" or sec.startswith("camera:")]
    if not sections:
        sys.exit(f"No [camera] section in {CONFIG}")
    # Bursts are kept next to the recordings for the kitchen model (tools/kitchen-ai).
    rec = cp.get("record", "folder", fallback="").strip()
    bursts = os.path.join(os.path.dirname(rec.rstrip("\\/")), "bursts") if rec else None
    cams = []
    for sec in sections:
        cam = {
            "server": server,
            "id": cp.get(sec, "id"),
            "key": cp.get(sec, "key"),
            "still_url": cp.get(sec, "still_url"),
            "watch_url": cp.get(sec, "watch_url"),
            "many": len(sections) > 1,
            "bursts": bursts,
        }
        if any(x in cam["still_url"] + cam["watch_url"] for x in ("PASSWORD", "CAMERA-IP")):
            sys.exit(f"Fill in the camera account and address for {cam['id']} in {CONFIG}")
        cams.append(cam)
    return cams


def call(s, path, body=None, timeout=90):
    req = urllib.request.Request(
        s["server"] + path,
        data=json.dumps(body).encode() if body is not None else None,
        method="POST" if body is not None else "GET",
        headers={"Content-Type": "application/json", "X-Camera-Id": s["id"], "X-Camera-Key": s["key"]},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode()).get("error", "")
        except Exception:
            detail = ""
        log(f"server said {e.code} {detail}", s)
        if e.code == 401:
            time.sleep(600)  # wrong key: don't hammer the server
        return None
    except Exception as e:
        log(f"server not reachable: {type(e).__name__}", s)
        return None


def grab_still(s):
    """One fresh full-size frame: (base64 JPEG, the frame) or (None, None)."""
    cap = cv2.VideoCapture(s["still_url"], cv2.CAP_FFMPEG)
    try:
        if not cap.isOpened():
            log("camera not reachable (check the Wi-Fi band, the address and the camera account)", s)
            return None, None
        frame = None
        for _ in range(12):  # skip the first frames so the picture is current and complete
            ok, f = cap.read()
            if ok:
                frame = f
        if frame is None:
            log("camera sent no picture", s)
            return None, None
        h, w = frame.shape[:2]
        small = cv2.resize(frame, (1280, int(h * 1280 / w))) if w > 1280 else frame
        ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return (base64.b64encode(jpg.tobytes()).decode(), frame) if ok else (None, None)
    finally:
        cap.release()


def faces_in(s, frame):
    """Names of the staff recognised in a full-size frame (the face numbers never leave this PC)."""
    if face_book is None:
        return None
    try:
        with _face_lock:
            return face_book.identify(frame)
    except Exception as e:  # noqa: BLE001
        log(f"face check failed: {type(e).__name__}", s)
        return None


def log_faces(s, seen):
    if seen and (seen["names"] or seen["unknown"]):
        known = ", ".join(seen["names"]) or "none known"
        extra = f" + {seen['unknown']} unknown" if seen["unknown"] else ""
        log(f"faces: {known}{extra}", s)


def send_still(s, kind):
    image, frame = grab_still(s)
    if not image:
        return None
    body = {"kind": kind, "image": image}
    seen = faces_in(s, frame)
    if seen is not None:
        body["faces"] = seen
        log_faces(s, seen)
    res = call(s, "/cctv/frame", body)
    if res:
        if res.get("skipped"):
            log(f"{kind} still skipped: {res['skipped']}", s)
        else:
            log(f"{kind} still checked: {res.get('peopleCount')} in view, missing {res.get('missing') or 'nothing'}, alert {res.get('alert') or 'none'}", s)
    return res


def jpeg(frame, width=1280, quality=65):
    h, w = frame.shape[:2]
    small = cv2.resize(frame, (width, int(h * width / w))) if w > width else frame
    ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(jpg.tobytes()).decode() if ok else None


def numberer(s):
    """The person finder from tools/kitchen-ai, or None when its models aren't set up."""
    global _numbers
    with _numbers_lock:
        if _numbers is None:
            try:
                if KITCHEN_AI not in sys.path:
                    sys.path.insert(0, KITCHEN_AI)
                from kai import config as kai_config, models as kai_models
                from kai.people import BurstNumbers
                ks = kai_config.load()
                _numbers = BurstNumbers(kai_models.Finder(kai_models.path_of(ks.models, kai_models.FINDER)),
                                        kai_models.Reader(kai_models.path_of(ks.models, kai_models.READER)))
                log("people in bursts will be numbered (kitchen model ready)", s)
            except Exception as e:  # noqa: BLE001
                _numbers = False
                log(f"people not numbered - kitchen model not ready ({type(e).__name__}: {e})", s)
        return _numbers or None


def number_people(s, frames):
    """The burst's people found and boxed: (the frames with numbered boxes as JPEGs, the body's
    "people": per-frame boxes, a crop and a Who-is-who photo per number), or (None, None)."""
    bn = numberer(s)
    if bn is None:
        return None, None
    try:
        from kai.people import crop_of, draw_numbers, who_photo
        with _numbers_lock:
            fitted, per_frame, best = bn.number(frames)
        images = [jpeg(draw_numbers(f, boxes)) for f, boxes in zip(fitted, per_frame)]
        if not all(images):
            return None, None
        crops, photos = {}, {}
        for n, (fi, box) in best.items():
            h, w = fitted[fi].shape[:2]
            crop = crop_of(fitted[fi], box)
            if crop.size:
                crops[n] = jpeg(crop, width=256, quality=80)
            photos[n] = jpeg(who_photo(fitted[fi], {"n": n, "box": [box[0] / w, box[1] / h, box[2] / w, box[3] / h]}), width=640, quality=75)
        return images, {"frames": per_frame, "crops": crops, "photos": photos}
    except Exception as e:  # noqa: BLE001
        log(f"people not numbered this burst ({type(e).__name__}: {e})", s)
        return None, None


def send_burst(s, frames, gap):
    """A burst: `frames` pictures `gap` seconds apart from the full stream, sent together."""
    images, times, names, unknown = [], [], set(), 0
    kept = []  # the frames at 1280 wide, for numbering the people
    cap = cv2.VideoCapture(s["still_url"], cv2.CAP_FFMPEG)
    try:
        if not cap.isOpened():
            log("camera not reachable (check the Wi-Fi band, the address and the camera account)", s)
            return None
        start = time.time() + 2  # let the stream settle
        for i in range(frames):
            due = start + i * gap
            # Keep reading so the picture taken is current, not an old one waiting in the stream.
            while time.time() < due:
                if not cap.grab():
                    cap.release()
                    time.sleep(1)
                    cap = cv2.VideoCapture(s["still_url"], cv2.CAP_FFMPEG)
            ok, frame = cap.read()
            if not ok:
                cap.release()
                cap = cv2.VideoCapture(s["still_url"], cv2.CAP_FFMPEG)
                ok, frame = cap.read()
            if not ok:
                continue
            image = jpeg(frame)
            if image:
                images.append(image)
                times.append(datetime.now())
                h, w = frame.shape[:2]
                kept.append(cv2.resize(frame, (1280, int(h * 1280 / w))) if w > 1280 else frame)
            seen = faces_in(s, frame)
            if seen:
                names.update(seen["names"])
                unknown = max(unknown, seen["unknown"])
    finally:
        cap.release()
    if len(images) < 2:
        log(f"burst failed: only {len(images)} of {frames} frames", s)
        return None
    boxed, people = number_people(s, kept)
    body = {"kind": "scheduled", "images": boxed or images}
    if people:
        body["people"] = people
    if face_book is not None:
        body["faces"] = {"names": sorted(names), "unknown": unknown}
        log_faces(s, body["faces"])
    res = call(s, "/cctv/frame", body, timeout=240)
    if res:
        if res.get("skipped"):
            log(f"burst skipped: {res['skipped']}", s)
        else:
            log(f"burst of {len(images)} checked{' (numbered)' if people else ''}: {res.get('peopleCount')} in view, missing {res.get('missing') or 'nothing'}, alert {res.get('alert') or 'none'}", s)
            keep_burst(s, images, times, gap, res, people)
    return res


def keep_burst(s, images, times, gap, res, people=None):
    """A burst with people in it, kept on the PC with the server's reading of each frame: the first
    labels for the kitchen model (tools/kitchen-ai). <bursts>\\<camera>\\<date>\\HH-MM-SS\\01.jpg...
    (without boxes) plus look.json (frame times, and per person: top colour, where, an activity per
    frame; numbered: the boxes per frame, and each box's day number - the same person all day)."""
    if not s.get("bursts") or not res.get("peopleCount"):
        return
    try:
        folder = os.path.join(s["bursts"], s["id"], times[0].strftime("%Y-%m-%d"), times[0].strftime("%H-%M-%S"))
        os.makedirs(folder, exist_ok=True)
        for i, image in enumerate(images, 1):
            with open(os.path.join(folder, f"{i:02d}.jpg"), "wb") as f:
                f.write(base64.b64decode(image))
        look = {"camera": s["id"], "times": [t.isoformat(timespec="seconds") for t in times], "gapSec": gap,
                "peopleCount": res.get("peopleCount"), "people": (res.get("look") or {}).get("people")}
        if people:
            look["boxes"] = people["frames"]
        with open(os.path.join(folder, "look.json"), "w", encoding="utf-8") as f:
            json.dump(look, f, indent=1)
    except OSError as e:
        log(f"burst not kept on the PC: {e}", s)


def watch_for_movement(s, seconds):
    """Watches the small stream for up to `seconds`; sends a still when something moves."""
    end = time.time() + seconds
    cap = cv2.VideoCapture(s["watch_url"], cv2.CAP_FFMPEG)
    if not cap.isOpened():
        log("small stream not reachable; trying again in a minute", s)
        time.sleep(60)
        return
    log("watching for movement (outside working hours)", s)
    prev, streak, last_sent = None, 0, 0.0
    try:
        while time.time() < end:
            ok, frame = cap.read()
            if not ok:
                log("small stream dropped; reconnecting", s)
                break
            small = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(frame, (320, 180)), cv2.COLOR_BGR2GRAY), (7, 7), 0)
            if prev is not None:
                diff = cv2.threshold(cv2.absdiff(prev, small), 25, 255, cv2.THRESH_BINARY)[1]
                share = cv2.countNonZero(diff) / diff.size
                streak = streak + 1 if share > MOTION_SHARE else 0
                if streak >= MOTION_FRAMES and time.time() - last_sent > MOTION_COOLDOWN_S:
                    log(f"movement ({share:.1%} of the picture)", s)
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


def run_camera(s):
    """One camera's loop: stills on schedule in working hours, movement watching after them."""
    log("camera watcher started", s)
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
            log("camera paused in the app", s)
            time.sleep(600)
            plan = None
            continue
        if plan.get("working"):
            wait = max(0, int(plan.get("nextStillInSec", 0)))
            if wait > 0:
                time.sleep(min(wait, CONFIG_EVERY_S))
                plan = None  # ask again: hours or settings may have changed
                continue
            burst = plan.get("burst")
            res = send_burst(s, int(burst["frames"]), int(burst["gapSec"])) if burst else send_still(s, "scheduled")
            plan, plan_at = (res, time.time()) if res and "working" in res else (None, 0.0)
            if not res:
                time.sleep(120)
        elif plan.get("watch", True):
            watch_for_movement(s, min(max(60, int(plan.get("nextStillInSec", 900))), CONFIG_EVERY_S))
            plan = None
        else:
            # No watching after hours for this camera: wait for working hours (or the PC to be
            # switched off).
            time.sleep(min(max(60, int(plan.get("nextStillInSec", 900))), CONFIG_EVERY_S))
            plan = None


def keep_running(s):
    # Keeps a camera going through anything unexpected (a camera that drops, a bad frame): log it,
    # wait a minute, start again.
    while True:
        try:
            run_camera(s)
        except Exception as e:  # noqa: BLE001
            log(f"error, restarting in a minute: {type(e).__name__}: {e}", s)
            time.sleep(60)


if __name__ == "__main__":
    try:
        cams = load_settings()
    except SystemExit as e:  # a missing or unfilled settings file stops it
        log(f"not running: {e}")
        raise
    if len(cams) == 1:
        try:
            keep_running(cams[0])
        except KeyboardInterrupt:
            log("stopped")
    else:
        for cam in cams:
            threading.Thread(target=keep_running, args=(cam,), name=cam["id"], daemon=True).start()
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            log("stopped")
