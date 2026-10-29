"""Bunny Momos face recognition for the camera PC (owner, 29 Oct 2026).

Everything here stays on this PC: the two OpenCV models (YuNet finds faces, SFace turns a face into
128 numbers), the face crops while they wait for a name, and each person's face numbers once named.
Only names ever go to the Bunny server. Building the list, as the owner suggested:

  python faces.py collect --minutes 20     face crops from the camera while people work
  python faces.py group                    groups the crops by person, one picture sheet per group
  python faces.py label 1="Vijay Das" 2=skip 3="Rudra Mahato"
                                           names the groups; their crops are then deleted
  python faces.py people                   who is known, with how many samples
  python faces.py forget "Rudra Mahato"    removes a person (when they leave)

camera_watch.py uses identify() on each still it sends.
Files: %LOCALAPPDATA%\\BunnyCamera\\models, ...\\faces (inbox, sheets, people.json).
"""
import argparse
import configparser
import json
import os
import shutil
import sys
import time
from datetime import datetime

import cv2
import numpy as np

HOME = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "BunnyCamera")
MODELS = os.path.join(HOME, "models")
FACES = os.path.join(HOME, "faces")
INBOX = os.path.join(FACES, "inbox")
SHEETS = os.path.join(FACES, "sheets")
PEOPLE = os.path.join(FACES, "people.json")

MIN_FACE_PX = 48       # smaller faces are too blurry to tell apart
DETECT_SCORE = 0.85
SAME_PERSON = 0.42     # cosine similarity for "same person" (OpenCV's SFace guide: 0.363)
GROUP_SAME = 0.45      # a bit stricter when grouping crops for naming
DUPLICATE = 0.88       # a crop this close to one from the last minute is the same moment


class FaceTool:
    def __init__(self):
        det = os.path.join(MODELS, "face_detection_yunet_2023mar.onnx")
        rec = os.path.join(MODELS, "face_recognition_sface_2021dec.onnx")
        if not (os.path.exists(det) and os.path.exists(rec)):
            raise FileNotFoundError(f"Face models missing in {MODELS}")
        self.detector = cv2.FaceDetectorYN.create(det, "", (320, 320), DETECT_SCORE)
        self.recognizer = cv2.FaceRecognizerSF.create(rec, "")

    def faces(self, frame):
        """[(row, crop_for_people, embedding)] for each face big enough to recognise."""
        h, w = frame.shape[:2]
        self.detector.setInputSize((w, h))
        _, found = self.detector.detect(frame)
        out = []
        for row in found if found is not None else []:
            x, y, fw, fh = (int(v) for v in row[:4])
            if fw < MIN_FACE_PX or fh < MIN_FACE_PX:
                continue
            aligned = self.recognizer.alignCrop(frame, row)
            emb = self.recognizer.feature(aligned).flatten().astype(np.float32)
            emb /= np.linalg.norm(emb) + 1e-9
            # A looser crop (head and a little around it) is easier for a person to recognise.
            pad = int(max(fw, fh) * 0.45)
            crop = frame[max(0, y - pad):min(h, y + fh + pad), max(0, x - pad):min(w, x + fw + pad)]
            out.append((row, crop, emb))
        return out


def load_people():
    if not os.path.exists(PEOPLE):
        return {}
    with open(PEOPLE, encoding="utf-8") as f:
        return {name: np.array(v, dtype=np.float32) for name, v in json.load(f).items()}


def save_people(people):
    os.makedirs(FACES, exist_ok=True)
    with open(PEOPLE, "w", encoding="utf-8") as f:
        json.dump({name: arr.round(5).tolist() for name, arr in people.items()}, f)


_tool, _people, _people_at = None, None, 0.0


def identify(frame):
    """{'names': [...], 'unknown': n} for the faces in a frame, or None when faces aren't set up."""
    global _tool, _people, _people_at
    try:
        if _tool is None:
            _tool = FaceTool()
        if _people is None or (os.path.exists(PEOPLE) and os.path.getmtime(PEOPLE) > _people_at):
            _people, _people_at = load_people(), time.time()
    except FileNotFoundError:
        return None
    names, unknown = [], 0
    for _, _, emb in _tool.faces(frame):
        best, score = None, 0.0
        for name, samples in _people.items():
            s = float((samples @ emb).max()) if len(samples) else 0.0
            if s > score:
                best, score = name, s
        if best and score >= SAME_PERSON:
            if best not in names:
                names.append(best)
        else:
            unknown += 1
    return {"names": names, "unknown": unknown}


def camera_url():
    cp = configparser.ConfigParser()
    cp.read(os.path.join(HOME, "camera_watch.ini"), encoding="utf-8")
    return cp.get("camera", "still_url")


def collect(minutes, max_crops=400):
    tool = FaceTool()
    os.makedirs(INBOX, exist_ok=True)
    index_path = os.path.join(INBOX, "crops.json")
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {}
    recent = []  # (time, embedding) of crops saved in the last minute
    end = time.time() + minutes * 60
    saved = 0
    cap = cv2.VideoCapture(camera_url(), cv2.CAP_FFMPEG)
    print(f"collecting faces for {minutes} min ...", flush=True)
    while time.time() < end and saved < max_crops:
        ok, frame = cap.read()
        if not ok:
            cap.release()
            time.sleep(3)
            cap = cv2.VideoCapture(camera_url(), cv2.CAP_FFMPEG)
            continue
        recent = [(t, e) for t, e in recent if time.time() - t < 60]
        for _, crop, emb in tool.faces(frame):
            if any(float(e @ emb) >= DUPLICATE for _, e in recent):
                continue
            name = f"{datetime.now():%Y%m%d-%H%M%S}-{saved:03d}.jpg"
            cv2.imwrite(os.path.join(INBOX, name), crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
            index[name] = emb.round(5).tolist()
            recent.append((time.time(), emb))
            saved += 1
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index, f)
        for _ in range(40):  # about one look every 2 seconds
            cap.grab()
    cap.release()
    print(f"saved {saved} face crops ({len(index)} waiting in total)")


def group():
    index_path = os.path.join(INBOX, "crops.json")
    if not os.path.exists(index_path):
        sys.exit("No face crops yet - run: python faces.py collect")
    index = json.load(open(index_path, encoding="utf-8"))
    names = [n for n in index if os.path.exists(os.path.join(INBOX, n))]
    embs = np.array([index[n] for n in names], dtype=np.float32)
    # Greedy grouping: each crop joins the group whose average it is closest to (if close enough).
    groups, centres = [], []
    for i, e in enumerate(embs):
        best, score = -1, 0.0
        for g, c in enumerate(centres):
            s = float(c @ e)
            if s > score:
                best, score = g, s
        if best >= 0 and score >= GROUP_SAME:
            groups[best].append(i)
            c = embs[groups[best]].mean(axis=0)
            centres[best] = c / (np.linalg.norm(c) + 1e-9)
        else:
            groups.append([i])
            centres.append(e)
    order = sorted(range(len(groups)), key=lambda g: -len(groups[g]))
    shutil.rmtree(SHEETS, ignore_errors=True)
    os.makedirs(SHEETS, exist_ok=True)
    out = {}
    for num, g in enumerate(order, start=1):
        files = [names[i] for i in groups[g]]
        out[str(num)] = files
        tiles = []
        for f in files[:12]:
            img = cv2.imread(os.path.join(INBOX, f))
            if img is not None:
                tiles.append(cv2.resize(img, (150, 150)))
        cols = min(6, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        sheet = np.full((50 + rows * 158, cols * 158 + 8, 3), 255, np.uint8)
        cv2.putText(sheet, f"Group {num}  ({len(files)} photos)", (8, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (30, 30, 30), 2)
        for k, t in enumerate(tiles):
            r, cidx = divmod(k, cols)
            sheet[50 + r * 158:50 + r * 158 + 150, 8 + cidx * 158:8 + cidx * 158 + 150] = t
        cv2.imwrite(os.path.join(SHEETS, f"group-{num:02d}.png"), sheet)
    with open(os.path.join(FACES, "groups.json"), "w", encoding="utf-8") as f:
        json.dump(out, f)
    print(f"{len(names)} crops in {len(out)} groups; sheets in {SHEETS}")
    for num, files in out.items():
        print(f"  group {num}: {len(files)} photos")


def label(pairs):
    groups = json.load(open(os.path.join(FACES, "groups.json"), encoding="utf-8"))
    index_path = os.path.join(INBOX, "crops.json")
    index = json.load(open(index_path, encoding="utf-8"))
    people = load_people()
    for pair in pairs:
        num, _, name = pair.partition("=")
        name = name.strip().strip('"')
        files = groups.get(num.strip(), [])
        if not files:
            print(f"no group {num}")
            continue
        if name.lower() != "skip":
            new = np.array([index[f] for f in files if f in index], dtype=np.float32)
            people[name] = np.vstack([people[name], new]) if name in people else new
            print(f"group {num} -> {name} ({len(new)} samples)")
        else:
            print(f"group {num} skipped")
        # The crops are not kept once decided - only the numbers of named people.
        for f in files:
            index.pop(f, None)
            try:
                os.remove(os.path.join(INBOX, f))
            except OSError:
                pass
    save_people(people)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect")
    c.add_argument("--minutes", type=float, default=20)
    sub.add_parser("group")
    lb = sub.add_parser("label")
    lb.add_argument("pairs", nargs="+")
    sub.add_parser("people")
    fg = sub.add_parser("forget")
    fg.add_argument("name")
    a = ap.parse_args()
    if a.cmd == "collect":
        collect(a.minutes)
    elif a.cmd == "group":
        group()
    elif a.cmd == "label":
        label(a.pairs)
    elif a.cmd == "people":
        for name, arr in load_people().items():
            print(f"{name}: {len(arr)} samples")
    elif a.cmd == "forget":
        people = load_people()
        print("removed" if people.pop(a.name, None) is not None else "not found")
        save_people(people)


if __name__ == "__main__":
    main()
