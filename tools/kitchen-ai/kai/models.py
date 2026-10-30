"""The two ready-made models everything stands on, run with onnxruntime (no PyTorch needed):
  - a person finder: YOLOX-S trained on COCO (OpenCV Zoo, Apache 2.0) - boxes round people, and phones;
  - a picture reader: DINOv2-small (Meta, Apache 2.0) - turns a crop of one person into 384 numbers
    that describe their pose, hands and what's around them. Our own model learns on top of these.
`python ka.py setup` downloads them into %LOCALAPPDATA%\\BunnyCamera\\models (owner's OK needed first).
The GPU is used when onnxruntime has it (onnxruntime-directml or -gpu); otherwise the CPU, which keeps up."""
import hashlib
import os
import urllib.request
from dataclasses import dataclass

import numpy as np
import cv2

PERSON, PHONE = 0, 67  # COCO classes


@dataclass(frozen=True)
class File:
    name: str
    url: str
    size: int
    sha256: str  # '' = not known before the first download (checked by size only)


FINDER = File("object_detection_yolox_2022nov.onnx",
              "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/object_detection_yolox/object_detection_yolox_2022nov.onnx",
              35858002, "")
READER = File("dinov2_small.onnx", "https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model.onnx",
              88532934, "f22797eabf810a75e41de68d378541ebea372122b25c4ce3ef25ff618250c20a")
ALL = (FINDER, READER)


def path_of(models_dir, f):
    return os.path.join(models_dir, f.name)


def check(models_dir, f):
    """'' if the file is there and right, else what's wrong."""
    p = path_of(models_dir, f)
    if not os.path.exists(p):
        return "missing"
    if os.path.getsize(p) != f.size:
        return f"wrong size ({os.path.getsize(p):,} bytes, expected {f.size:,})"
    if f.sha256:
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        if h.hexdigest() != f.sha256:
            return "checksum does not match"
    return ""


def download(models_dir, f, say=print):
    os.makedirs(models_dir, exist_ok=True)
    p = path_of(models_dir, f)
    tmp = p + ".part"
    say(f"downloading {f.name} ({f.size / 1e6:.1f} MB) from {f.url.split('/')[2]}")
    urllib.request.urlretrieve(f.url, tmp)
    os.replace(tmp, p)
    problem = check(models_dir, f)
    if problem:
        os.remove(p)
        raise SystemExit(f"{f.name}: {problem} - deleted, nothing kept")
    say(f"  ok: {p}")


def _session(path):
    import onnxruntime as ort
    wanted = ["DmlExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]
    have = [p for p in wanted if p in ort.get_available_providers()]
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    return ort.InferenceSession(path, opts, providers=have)


def _nms(boxes, scores, thr):
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        area = lambda j: (boxes[j, 2] - boxes[j, 0]) * (boxes[j, 3] - boxes[j, 1])  # noqa: E731
        o = inter / (area(i) + area(order[1:]) - inter + 1e-9)
        order = order[1:][o <= thr]
    return keep


class Finder:
    """People (and phones) in a frame: [(x1, y1, x2, y2, score, cls)] in pixels."""
    SIZE = 640
    STRIDES = (8, 16, 32)

    def __init__(self, path, rgb=True):
        self.sess = _session(path)
        self.inp = self.sess.get_inputs()[0].name
        self.rgb = rgb
        grids, strides = [], []
        for s in self.STRIDES:
            n = self.SIZE // s
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
            strides.append(np.full((n * n, 1), s))
        self.grids = np.concatenate(grids).astype(np.float32)
        self.strides = np.concatenate(strides).astype(np.float32)

    def find(self, frame, min_score=0.3, classes=(PERSON, PHONE), nms=0.45):
        h, w = frame.shape[:2]
        r = min(self.SIZE / h, self.SIZE / w)
        img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if self.rgb else frame
        pad = np.full((self.SIZE, self.SIZE, 3), 114, np.float32)
        pad[: round(h * r), : round(w * r)] = cv2.resize(img, (round(w * r), round(h * r)))
        out = self.sess.run(None, {self.inp: pad.transpose(2, 0, 1)[None]})[0][0]
        if out.shape[0] == self.grids.shape[0] and out[:, 2:4].max() < 30:  # raw head: decode the grid
            out = out.copy()
            out[:, :2] = (out[:, :2] + self.grids) * self.strides
            out[:, 2:4] = np.exp(out[:, 2:4]) * self.strides
        found = []
        for cls in classes:
            scores = out[:, 4] * out[:, 5 + cls]
            sel = scores >= min_score
            if not sel.any():
                continue
            c = out[sel, :4] / r
            b = np.stack([c[:, 0] - c[:, 2] / 2, c[:, 1] - c[:, 3] / 2, c[:, 0] + c[:, 2] / 2, c[:, 1] + c[:, 3] / 2], 1)
            b[:, [0, 2]] = b[:, [0, 2]].clip(0, w - 1)
            b[:, [1, 3]] = b[:, [1, 3]].clip(0, h - 1)
            s = scores[sel]
            for i in _nms(b, s, nms):
                found.append((*map(float, b[i]), float(s[i]), cls))
        return found


class Reader:
    """384 numbers per person crop (DINOv2-small's summary of the picture), unit length."""
    SIZE = 224
    MEAN = np.array([0.485, 0.456, 0.406], np.float32)
    STD = np.array([0.229, 0.224, 0.225], np.float32)

    def __init__(self, path):
        self.sess = _session(path)
        self.inp = self.sess.get_inputs()[0].name
        self.outs = [o.name for o in self.sess.get_outputs()]

    def _prep(self, crop):
        h, w = crop.shape[:2]
        side = max(h, w)
        sq = np.full((side, side, 3), 124, np.uint8)
        sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = crop
        x = cv2.resize(sq, (self.SIZE, self.SIZE), interpolation=cv2.INTER_AREA)
        x = cv2.cvtColor(x, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
        return ((x - self.MEAN) / self.STD).transpose(2, 0, 1)

    def read(self, crops, batch=16):
        if not crops:
            return np.zeros((0, 384), np.float32)
        out = []
        for i in range(0, len(crops), batch):
            x = np.stack([self._prep(c) for c in crops[i:i + batch]])
            res = dict(zip(self.outs, self.sess.run(None, {self.inp: x})))
            v = res["pooler_output"] if "pooler_output" in res else res[self.outs[0]][:, 0]
            out.append(v)
        v = np.concatenate(out).astype(np.float32)
        return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
