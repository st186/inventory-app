"""The colour of someone's top, in the same words Bunny's burst reading uses (insights.ts, `top`), so a
person the model finds can be matched to the one Bunny described, and to the name tapped for that
colour in the app's Who is who card."""
import math

import numpy as np
import cv2

PALETTE = {
    "red": (200, 30, 40), "orange": (240, 130, 30), "yellow": (240, 210, 40), "green": (40, 140, 60),
    "teal": (0, 128, 128), "blue": (40, 90, 200), "navy": (25, 35, 80), "purple": (110, 50, 150),
    "pink": (235, 130, 170), "white": (235, 235, 235), "grey": (128, 128, 128), "black": (25, 25, 25),
    "brown": (110, 70, 40), "beige": (215, 195, 160),
}
NAMES = list(PALETTE)
_LAB = cv2.cvtColor(np.array([[PALETTE[n][::-1] for n in NAMES]], np.float32) / 255, cv2.COLOR_BGR2Lab)[0]

# Colours easily taken for each other on a kitchen camera: a near miss when matching.
NEAR = [{"navy", "blue", "teal"}, {"white", "grey", "beige"}, {"black", "navy", "grey"}, {"brown", "beige", "orange"},
        {"red", "pink", "orange"}, {"purple", "pink", "navy"}, {"yellow", "orange", "beige"}, {"green", "teal"},
        {"yellow", "green"}]  # pale yellow turns greenish in the daylight from the door


CHROMA_MIN = 12      # below this a pixel has no real colour (white / grey / black)
COLOURED_SHARE = 0.4  # at least this share of the top must be coloured to call it a colour


def name_lab(L, a, b):
    """A colour name for one Lab colour. Camera colours come out washed out, so it goes by hue and
    lightness (yellow is yellow even when pale) rather than by the nearest textbook colour."""
    c = math.hypot(a, b)
    h = math.degrees(math.atan2(b, a)) % 360
    if c < 10:
        return "black" if L < 28 else "white" if L > 75 else "grey"
    if 50 <= h < 110 and c < 24 and L >= 55:
        return "beige"
    if h >= 335 or h < 50:
        return "brown" if L < 35 else "pink" if L >= 62 else "red"
    if h < 72:
        return "brown" if L < 50 else "orange"
    if h < 110:
        return "brown" if L < 45 else "yellow"
    if h < 170:
        return "green"
    if h < 230:
        return "teal"
    if h < 305:
        return "navy" if L < 35 else "blue"
    return "purple" if L < 60 else "pink"


def top_colour(frame, box):
    """The main colour of the top of the person in `box` (x1, y1, x2, y2 in pixels): the middle of the
    body below the head, not the hairnet or the legs."""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    a, b = int(y1 + 0.25 * h), int(y1 + 0.55 * h)
    c, d = int(x1 + 0.25 * w), int(x2 - 0.25 * w)
    patch = frame[max(0, a):max(a + 1, b), max(0, c):max(c + 1, d)]
    if patch.size == 0:
        return "other"
    if patch.shape[0] * patch.shape[1] > 2500:
        patch = cv2.resize(patch, (50, 50), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(patch.astype(np.float32) / 255, cv2.COLOR_BGR2Lab).reshape(-1, 3)
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    coloured = chroma >= CHROMA_MIN
    if coloured.mean() >= COLOURED_SHARE:
        hue = (np.degrees(np.arctan2(lab[coloured, 2], lab[coloured, 1])) % 360) // 15
        mode = np.bincount(hue.astype(int), minlength=24).argmax()
        near = np.abs(((hue - mode + 12) % 24) - 12) <= 1  # the commonest hue and its neighbours
        L, A, B = np.median(lab[coloured][near], axis=0)
    else:
        L, A, B = np.median(lab[~coloured], axis=0)
    return name_lab(float(L), float(A), float(B))


def distance(a, b):
    """0 the same colour, 0.5 easily confused, 1 different; 0.7 when either is 'patterned' / 'other'."""
    if a == b:
        return 0.0
    if a in ("patterned", "other") or b in ("patterned", "other"):
        return 0.7
    return 0.5 if any(a in g and b in g for g in NEAR) else 1.0
