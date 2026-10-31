"""Our own model: from a person's numbers (the 384 picture numbers, how much they moved, their zone,
a phone in their box, the shape of their box) to what they're doing. A softmax classifier written
in numpy - quick to train on this PC, nothing to install, and hard to overfit with a few thousand
labels. Your labels count fully; Bunny's burst labels count ai_weight (0.4). Checked on hours it
never trained on, so the score is what to expect on a new day."""
import json
import os
from datetime import datetime

import numpy as np

from .store import ACTIVITIES

FEAT = 384


def spec_from(rows):
    zones = sorted({r["zone"] or "" for r in rows} - {""})
    mot = [r["motion"] for r in rows if r["motion"] is not None]
    mov = [r["moving"] for r in rows if r["moving"] is not None]
    return {"zones": zones, "motion": float(np.median(mot)) if mot else 0.0, "moving": float(np.median(mov)) if mov else 0.0}


def features(rows, spec, feat_of):
    """One row of numbers per person (the same layout in training and when running)."""
    zones = spec["zones"]
    X = np.zeros((len(rows), FEAT + 4 + len(zones) + 1 + 4), np.float32)
    for i, r in enumerate(rows):
        X[i, :FEAT] = feat_of(r)
        has = r["motion"] is not None
        j = FEAT
        X[i, j:j + 4] = [r["motion"] if has else spec["motion"], r["moving"] if has else spec["moving"], float(has), float(bool(r["phone"]))]
        j += 4
        z = r["zone"] or ""
        X[i, j + (zones.index(z) if z in zones else len(zones))] = 1
        j += len(zones) + 1
        h, w = r["y2"] - r["y1"], r["x2"] - r["x1"]
        X[i, j:j + 4] = [h, w / max(h, 1e-6), (r["y1"] + r["y2"]) / 2, (r["x1"] + r["x2"]) / 2]
    return X


def fit(X, y, w, k, l2=1e-2, iters=500, lr=0.05, seed=0):
    """Weighted softmax regression with Adam; X already standardised."""
    rng = np.random.default_rng(seed)
    n, d = X.shape
    W = rng.normal(0, 0.01, (d, k)).astype(np.float32)
    b = np.zeros(k, np.float32)
    Y = np.eye(k, dtype=np.float32)[y]
    mW, vW, mb, vb = np.zeros_like(W), np.zeros_like(W), np.zeros_like(b), np.zeros_like(b)
    ws = w / w.sum()
    for t in range(1, iters + 1):
        P = softmax(X @ W + b)
        G = (P - Y) * ws[:, None]
        gW = X.T @ G + l2 * W
        gb = G.sum(0)
        for g, m, v, p in ((gW, mW, vW, W), (gb, mb, vb, b)):
            m *= 0.9
            m += 0.1 * g
            v *= 0.999
            v += 0.001 * g * g
            p -= lr * (m / (1 - 0.9 ** t)) / (np.sqrt(v / (1 - 0.999 ** t)) + 1e-8)
    return W, b


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def split(rows, frac=0.2):
    """Hold out whole hours (date + hour), so near-identical frames never sit on both sides."""
    hours = sorted({r["ts"][:13] for r in rows})
    held = {h for i, h in enumerate(hours) if (i * 7919) % 100 < frac * 100}
    if not held and len(hours) > 1:
        held = {hours[-1]}
    return [r for r in rows if r["ts"][:13] not in held], [r for r in rows if r["ts"][:13] in held]


def scores(y_true, y_pred, k):
    cm = np.zeros((k, k), int)
    for a, b in zip(y_true, y_pred):
        cm[a, b] += 1
    per = {}
    for c in range(k):
        tp, fn, fp = cm[c, c], cm[c].sum() - cm[c, c], cm[:, c].sum() - cm[c, c]
        if cm[c].sum() == 0 and cm[:, c].sum() == 0:
            continue
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        per[ACTIVITIES[c]] = {"n": int(cm[c].sum()), "precision": round(p, 3), "recall": round(r, 3), "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0}
    acc = float(np.trace(cm) / cm.sum()) if cm.sum() else 0.0
    f1s = [v["f1"] for v in per.values() if v["n"]]
    return {"n": int(cm.sum()), "accuracy": round(acc, 3), "macroF1": round(float(np.mean(f1s)), 3) if f1s else 0.0, "perClass": per, "confusion": cm.tolist()}


class Model:
    def __init__(self, W, b, mean, std, spec, name):
        self.W, self.b, self.mean, self.std, self.spec, self.name = W, b, mean, std, spec, name

    def proba(self, X):
        return softmax(((X - self.mean) / self.std) @ self.W + self.b)

    def save(self, folder, report):
        os.makedirs(folder, exist_ok=True)
        np.savez(os.path.join(folder, "weights.npz"), W=self.W, b=self.b, mean=self.mean, std=self.std)
        with open(os.path.join(folder, "model.json"), "w", encoding="utf-8") as f:
            json.dump({"name": self.name, "classes": ACTIVITIES, "spec": self.spec, "report": report}, f, indent=1)

    @staticmethod
    def load(folder):
        with open(os.path.join(folder, "model.json"), encoding="utf-8") as f:
            meta = json.load(f)
        z = np.load(os.path.join(folder, "weights.npz"))
        return Model(z["W"], z["b"], z["mean"], z["std"], meta["spec"], meta["name"])


def train(rows, feat_of, ai_weight=0.4, frac=0.2):
    """Train on all but the held-out hours, report on them, then train the final model on everything."""
    k = len(ACTIVITIES)
    label = lambda r: ACTIVITIES.index(r["owner"] or r["ai"])  # noqa: E731
    weight = lambda r: 1.0 if r["owner"] else ai_weight  # noqa: E731

    def one(train_rows):
        spec = spec_from(train_rows)
        X = features(train_rows, spec, feat_of)
        y = np.array([label(r) for r in train_rows])
        w = np.array([weight(r) for r in train_rows], np.float32)
        counts = np.bincount(y, minlength=k).astype(np.float32)
        cw = np.clip(len(y) / (k * np.maximum(counts, 1)), 0.2, 5.0)  # rare activities count more
        mean, std = X.mean(0), X.std(0) + 1e-6
        W, b = fit((X - mean) / std, y, w * cw[y], k)
        return Model(W, b, mean, std, spec, "")

    tr, te = split(rows, frac)
    report = {"trainedOn": len(tr), "checkedOn": len(te)}
    if tr and te:
        m = one(tr)
        pred = m.proba(features(te, m.spec, feat_of)).argmax(1)
        y = np.array([label(r) for r in te])
        mine = np.array([bool(r["owner"]) for r in te])
        report["vsYours"] = scores(y[mine], pred[mine], k) if mine.any() else None
        report["vsBunny"] = scores(y[~mine], pred[~mine], k) if (~mine).any() else None
    final = one(rows)
    final.name = "kitchen-" + datetime.now().strftime("%Y%m%d-%H%M")
    report["labels"] = {"yours": sum(1 for r in rows if r["owner"]), "bunny": sum(1 for r in rows if not r["owner"])}
    report["perActivity"] = {a: sum(1 for r in rows if (r["owner"] or r["ai"]) == a) for a in ACTIVITIES}
    return final, report


def smooth(labels, window=3):
    """Majority over a few looks in a row for one person: one odd frame doesn't make a phone call."""
    out = []
    for i in range(len(labels)):
        part = labels[max(0, i - window // 2): i + window // 2 + 1]
        out.append(max(set(part), key=lambda x: (part.count(x), x == labels[i])))
    return out
