"""Where everything lives. Read from the camera watcher's settings file (camera_watch.ini: the cameras
and the [record] folder), plus an optional [kitchen_ai] section in the same file:

    [kitchen_ai]
    step_sec = 10        ; seconds between the frames taken from a recording
    width = 1280         ; every frame is looked at this wide (the bursts are sent this wide too)
    min_score = 0.45     ; how sure the person finder must be
    hours = 07:00-21:00  ; when `ka.py run` watches the kitchen
    live_every_sec = 5   ; seconds between looks in `ka.py run`
    live_stream = still  ; still = the camera's full stream, watch = its small one
    port = 8765          ; the labelling page: http://localhost:8765
    ai_weight = 0.4      ; how much a label from Bunny's burst reading counts against one of yours
"""
import configparser
import os
from dataclasses import dataclass, field

HOME = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "BunnyCamera")
INI = os.path.join(HOME, "camera_watch.ini")
MODELS = os.path.join(HOME, "models")  # downloaded models (person finder, picture reader)
ZONES = os.path.join(HOME, "zones")    # drawn with tools/cctv/zones.py


@dataclass
class Settings:
    root: str
    cameras: list = field(default_factory=list)  # [{"id", "still_url", "watch_url"}]
    step_sec: float = 10
    width: int = 1280
    min_score: float = 0.45
    hours: tuple = ("07:00", "21:00")
    live_every_sec: float = 5
    live_stream: str = "still"
    port: int = 8765
    ai_weight: float = 0.4
    models: str = MODELS
    zones: str = ZONES

    @property
    def recordings(self):
        return os.path.join(self.root, "recordings")

    @property
    def bursts(self):
        return os.path.join(self.root, "bursts")

    @property
    def dataset(self):
        return os.path.join(self.root, "dataset")

    @property
    def trained(self):
        return os.path.join(self.root, "models")

    @property
    def reports(self):
        return os.path.join(self.root, "reports")

    @property
    def activity(self):
        return os.path.join(self.root, "activity")

    def camera(self, cam_id=None):
        if not self.cameras:
            raise SystemExit(f"No camera in {INI}")
        if cam_id is None:
            return self.cameras[0]
        for c in self.cameras:
            if c["id"] == cam_id:
                return c
        raise SystemExit(f"No camera {cam_id} in {INI}")


def load(ini=INI, root=None):
    cp = configparser.ConfigParser(inline_comment_prefixes=(";",))
    cp.read(ini, encoding="utf-8")
    rec = cp.get("record", "folder", fallback=r"D:\BunnyCamera\recordings").strip()
    s = Settings(root=root or os.path.dirname(rec.rstrip("\\/")))
    for sec in cp.sections():
        if sec == "camera" or sec.startswith("camera:"):
            s.cameras.append({"id": cp.get(sec, "id"), "still_url": cp.get(sec, "still_url", fallback=""),
                              "watch_url": cp.get(sec, "watch_url", fallback="")})
    if cp.has_section("kitchen_ai"):
        k = cp["kitchen_ai"]
        s.step_sec = k.getfloat("step_sec", s.step_sec)
        s.width = k.getint("width", s.width)
        s.min_score = k.getfloat("min_score", s.min_score)
        if "hours" in k:
            a, b = k.get("hours").split("-")
            s.hours = (a.strip(), b.strip())
        s.live_every_sec = k.getfloat("live_every_sec", s.live_every_sec)
        s.live_stream = k.get("live_stream", s.live_stream).strip()
        s.port = k.getint("port", s.port)
        s.ai_weight = k.getfloat("ai_weight", s.ai_weight)
    return s
