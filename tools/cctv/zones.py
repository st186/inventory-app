"""Draw the kitchen's zones on each camera's picture (owner, 29 Oct 2026: "add more cameras in the same
location with overlapping ROIs").

A zone is an area of the kitchen: the folding table, the dough machine, the steamer... Click
around it on the picture, press Enter and give it a name. Use the SAME name for the same area on
every camera that sees it: two cameras whose views overlap then agree on where someone is, and a
person seen in that zone by both is counted once. A zone can be drawn on as many cameras as see it.

Saved to %LOCALAPPDATA%\\BunnyCamera\\zones\\<camera id>.json:
    {"camera": id, "size": [w, h], "picture": path, "zones": [{"name": "Folding table",
     "points": [[x, y], ...]}]}       (x, y as 0-1 of the width / height, so any resolution fits)
and zones\\place.json lists every zone name and the cameras that see it.

Run:  python zones.py            (asks which camera)
      python zones.py cam-kitchen1
Keys: left click = add a point, right click = undo a point, Enter = finish the zone and name it,
      d = delete the last zone, s = save and close, Esc = close without saving.
"""
import json
import os
import sys

import cv2
import numpy as np

import camera_watch as cw

ZONES = os.path.join(cw.HOME, "zones")
SUGGESTED = ["Folding table", "Dough machine", "Filling table", "Steamer / stove", "Packing table", "Sink / washing", "Door", "Store room"]
COLOURS = [(0, 140, 255), (0, 200, 0), (255, 120, 0), (200, 0, 200), (0, 200, 200), (60, 60, 255), (160, 160, 0), (255, 0, 120)]


def picture(cam):
    """A current picture from the camera (or the recorder's still for today)."""
    cap = cv2.VideoCapture(cam["still_url"], cv2.CAP_FFMPEG)
    frame = None
    try:
        for _ in range(12):
            ok, f = cap.read()
            if ok:
                frame = f
    finally:
        cap.release()
    return frame


def ask_name(existing):
    print("\nName this zone. Same area on another camera = same name.")
    names = list(dict.fromkeys(existing + SUGGESTED))
    for i, n in enumerate(names, 1):
        print(f"  {i}. {n}")
    raw = input("Number or a new name: ").strip()
    if raw.isdigit() and 1 <= int(raw) <= len(names):
        return names[int(raw) - 1]
    return raw[:40] or None


def place_names():
    names = {}
    if os.path.isdir(ZONES):
        for f in os.listdir(ZONES):
            if f.endswith(".json") and f != "place.json":
                try:
                    data = json.load(open(os.path.join(ZONES, f), encoding="utf-8"))
                    for z in data.get("zones", []):
                        names.setdefault(z["name"], []).append(data["camera"])
                except (OSError, ValueError, KeyError):
                    pass
    return names


def main():
    cams = cw.load_settings()
    want = sys.argv[1] if len(sys.argv) > 1 else None
    if not want:
        for i, c in enumerate(cams, 1):
            print(f"  {i}. {c['id']}")
        raw = input("Which camera (number)? ").strip()
        want = cams[int(raw) - 1]["id"] if raw.isdigit() and 1 <= int(raw) <= len(cams) else cams[0]["id"]
    cam = next((c for c in cams if c["id"] == want), None)
    if not cam:
        sys.exit(f"No camera {want} in {cw.CONFIG}")
    frame = picture(cam)
    if frame is None:
        sys.exit("The camera sent no picture (is it on the same Wi-Fi?)")
    h, w = frame.shape[:2]
    os.makedirs(ZONES, exist_ok=True)
    path = os.path.join(ZONES, f"{cam['id']}.json")
    zones = json.load(open(path, encoding="utf-8")).get("zones", []) if os.path.exists(path) else []
    current = []
    scale = min(1.0, 1280 / w)

    def draw():
        img = frame.copy()
        for i, z in enumerate(zones):
            pts = [(int(x * w), int(y * h)) for x, y in z["points"]]
            col = COLOURS[i % len(COLOURS)]
            cv2.polylines(img, [np.array(pts, dtype=np.int32)], True, col, 3)
            cv2.putText(img, z["name"], pts[0], cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)
        for p in current:
            cv2.circle(img, (int(p[0] * w), int(p[1] * h)), 6, (255, 255, 255), -1)
        if len(current) > 1:
            for a, b in zip(current, current[1:]):
                cv2.line(img, (int(a[0] * w), int(a[1] * h)), (int(b[0] * w), int(b[1] * h)), (255, 255, 255), 2)
        cv2.imshow("Bunny zones", cv2.resize(img, (int(w * scale), int(h * scale))))

    def click(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN:
            current.append([round(x / scale / w, 4), round(y / scale / h, 4)])
        elif event == cv2.EVENT_RBUTTONDOWN and current:
            current.pop()
        draw()

    print(__doc__.split("Run:")[1])
    cv2.namedWindow("Bunny zones")
    cv2.setMouseCallback("Bunny zones", click)
    draw()
    while True:
        key = cv2.waitKey(50) & 0xFF
        if key == 13 and len(current) >= 3:  # Enter
            name = ask_name([z["name"] for z in zones] + list(place_names()))
            if name:
                zones.append({"name": name, "points": current[:]})
            current.clear()
            draw()
        elif key == ord("d") and zones:
            zones.pop()
            draw()
        elif key == ord("s"):
            pic = os.path.join(ZONES, f"{cam['id']}.jpg")
            cv2.imwrite(pic, frame)
            json.dump({"camera": cam["id"], "size": [w, h], "picture": pic, "zones": zones}, open(path, "w", encoding="utf-8"), indent=1)
            json.dump(place_names(), open(os.path.join(ZONES, "place.json"), "w", encoding="utf-8"), indent=1)
            print(f"Saved {len(zones)} zones for {cam['id']} in {path}")
            break
        elif key == 27:  # Esc
            print("Closed without saving")
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
