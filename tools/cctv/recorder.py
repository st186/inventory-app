"""Bunny Momos kitchen recorder (owner, 29 Oct 2026: record 8 AM to 8 PM for 7 days, to build our own
dataset of kitchen work - folding, phone, steaming, packing, cleaning, at the machine, idle).

Saves each camera's own video exactly as the camera sends it (no re-encoding, no sound) in
30-minute pieces:   <folder>\\<camera id>\\<date>\\HH-MM-SS.mp4
plus one reference picture a day (<date>\\still.jpg) to draw and check the kitchen zones on
(zones.py). Several cameras in the same place are recorded side by side; their zones share names
where their views overlap. Nothing leaves this PC.

Settings: the [record] section of %LOCALAPPDATA%\\BunnyCamera\\camera_watch.ini (the cameras are
the [camera:...] sections camera_watch.py uses):
    [record]
    first_day = 2026-10-30
    days = 7
    from = 08:00
    to = 20:00
    folder = D:\\BunnyCamera\\recordings
    cameras =                 (camera ids, comma-separated; blank = every camera in the file)
    min_free_gb = 15          (stops before the disk fills up)
    segment_min = 30          (minutes per video file; owner, 29 Oct 2026)
Stops by itself after the last day. Log: recorder.log next to the settings. Needs FFmpeg
(winget install Gyan.FFmpeg). Run:  pythonw recorder.py
"""
import configparser
import glob
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import date, datetime, timedelta

import cv2

import camera_watch as cw

LOG = os.path.join(cw.HOME, "recorder.log")
_log_lock = threading.Lock()


def log(msg, cam=None):
    os.makedirs(cw.HOME, exist_ok=True)
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {f'[{cam}] ' if cam else ''}{msg}"
    with _log_lock:
        try:
            with open(LOG, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass
    if sys.stdout:
        print(line, flush=True)


def find_ffmpeg(setting):
    if setting and os.path.exists(setting):
        return setting
    found = shutil.which("ffmpeg")
    if found:
        return found
    hits = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg*", "*", "bin", "ffmpeg.exe"))
    return hits[0] if hits else None


def load_plan():
    cp = configparser.ConfigParser()
    cp.read(cw.CONFIG, encoding="utf-8")
    if not cp.has_section("record"):
        sys.exit("No [record] section in the settings file")
    r = cp["record"]
    first = date.fromisoformat(r.get("first_day", date.today().isoformat()).strip())
    plan = {
        "first": first,
        "last": first + timedelta(days=max(1, r.getint("days", 7)) - 1),
        "from": r.get("from", "08:00").strip(),
        "to": r.get("to", "20:00").strip(),
        "folder": r.get("folder", r"D:\BunnyCamera\recordings").strip(),
        "min_free_gb": r.getfloat("min_free_gb", 15.0),
        "segment_s": max(60, int(r.getfloat("segment_min", 30) * 60)),
        "ffmpeg": find_ffmpeg(r.get("ffmpeg", "").strip()),
    }
    wanted = [x.strip() for x in r.get("cameras", "").split(",") if x.strip()]
    cams = [c for c in cw.load_settings() if not wanted or c["id"] in wanted]
    return plan, cams


def recording_now(plan, now):
    hhmm = now.strftime("%H:%M")
    return plan["first"] <= now.date() <= plan["last"] and plan["from"] <= hhmm < plan["to"]


def free_gb(folder):
    try:
        return shutil.disk_usage(os.path.splitdrive(folder)[0] + "\\").free / 1e9
    except OSError:
        return 0.0


def save_still(cam, folder):
    """One picture a day to draw / check the zones on (a moved camera shows up here)."""
    path = os.path.join(folder, "still.jpg")
    if os.path.exists(path):
        return
    cap = cv2.VideoCapture(cam["still_url"], cv2.CAP_FFMPEG)
    try:
        frame = None
        for _ in range(12):
            ok, f = cap.read()
            if ok:
                frame = f
        if frame is not None:
            cv2.imwrite(path, frame)
    finally:
        cap.release()


def start_ffmpeg(plan, cam, day_folder):
    """FFmpeg's own messages go to a file (a pipe nobody reads could fill up and freeze it).

    Fragmented MP4 (owner, 31 Oct 2026): a plain MP4 is only playable once FFmpeg closes it, so when
    the camera froze on 30 Oct at 12:52 and FFmpeg had to be stopped hard, 12:30-12:54 was lost. In
    pieces written fragment by fragment, everything up to the cut still plays (checked: a file cut at
    60% opens in OpenCV with its frames and seeks; kitchen-ai video.py reads them as before)."""
    os.makedirs(day_folder, exist_ok=True)
    args = [
        plan["ffmpeg"], "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", cam["still_url"],
        "-an", "-c:v", "copy", "-f", "segment", "-segment_time", str(plan.get("segment_s", 1800)), "-reset_timestamps", "1", "-strftime", "1",
        "-segment_format_options", "movflags=+frag_keyframe+empty_moov+default_base_moof",
        os.path.join(day_folder, "%H-%M-%S.mp4"),
    ]
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    err = open(os.path.join(cw.HOME, f"ffmpeg-{cam['id']}.log"), "ab")
    return subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=err, creationflags=flags)


def last_error(cam):
    try:
        with open(os.path.join(cw.HOME, f"ffmpeg-{cam['id']}.log"), "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 400))
            return f.read().decode(errors="replace").replace(cam["still_url"], "<camera>").strip().splitlines()[-1:] or [""]
    except OSError:
        return [""]


def stalled(day_folder):
    """No piece written to for 2 minutes while recording: the stream froze."""
    files = glob.glob(os.path.join(day_folder, "*.mp4"))
    return bool(files) and time.time() - max(os.path.getmtime(f) for f in files) > 120


def stop_ffmpeg(p):
    """Stops cleanly ("q") so the last piece is a playable file."""
    if p and p.poll() is None:
        try:
            p.communicate(b"q", timeout=20)
        except Exception:  # noqa: BLE001
            p.kill()


def folder_gb(path):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total / 1e9


def run_camera(plan, cam):
    cid = cam["id"]
    base = os.path.join(plan["folder"], cid)
    proc, proc_day, fails = None, None, 0
    log(f"ready: records {plan['from']}-{plan['to']}, {plan['first']} to {plan['last']}", cid)
    while True:
        now = datetime.now()
        if now.date() > plan["last"]:
            stop_ffmpeg(proc)
            log(f"recording finished: {folder_gb(base):.1f} GB in {base}", cid)
            return
        if recording_now(plan, now) and free_gb(plan["folder"]) >= plan["min_free_gb"]:
            day_folder = os.path.join(base, now.strftime("%Y-%m-%d"))
            frozen = proc is not None and proc.poll() is None and stalled(day_folder)
            if proc is None or proc.poll() is not None or proc_day != now.date() or frozen:
                if proc is not None and (proc.poll() is not None or frozen):
                    fails += 1
                    log(f"recording {'froze' if frozen else 'stopped'} ({last_error(cam)[0][:200] or 'no message'}); starting again", cid)
                    time.sleep(min(60, 5 * fails))
                stop_ffmpeg(proc)
                os.makedirs(day_folder, exist_ok=True)
                try:
                    save_still(cam, day_folder)
                except Exception as e:  # noqa: BLE001
                    log(f"no still today: {type(e).__name__}", cid)
                proc, proc_day = start_ffmpeg(plan, cam, day_folder), now.date()
                log(f"recording to {day_folder}", cid)
            else:
                fails = 0
        else:
            if proc is not None and proc.poll() is None:
                stop_ffmpeg(proc)
                why = "disk nearly full" if recording_now(plan, now) else "outside recording hours"
                log(f"stopped: {why} ({free_gb(plan['folder']):.0f} GB free)", cid)
            proc = None
        time.sleep(20)


def main():
    try:
        plan, cams = load_plan()
    except SystemExit as e:
        log(f"not recording: {e}")
        raise
    if not plan["ffmpeg"]:
        log("not recording: FFmpeg isn't installed (winget install Gyan.FFmpeg)")
        return
    if not cams:
        log("not recording: no cameras to record")
        return
    if datetime.now().date() > plan["last"]:
        log(f"not recording: the {plan['first']} to {plan['last']} recording is over")
        return
    os.makedirs(plan["folder"], exist_ok=True)
    threads = [threading.Thread(target=run_camera, args=(plan, c), name=c["id"], daemon=True) for c in cams]
    for t in threads:
        t.start()
    try:
        while any(t.is_alive() for t in threads):
            time.sleep(60)
    except KeyboardInterrupt:
        log("stopped by hand")


if __name__ == "__main__":
    main()
