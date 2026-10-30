"""The colour of someone's top, in the same words Bunny's burst reading uses (insights.ts, `top`), so a
person the model finds can be matched to the one Bunny described, and to the name tapped for that
colour in the app's Who is who card."""
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
        {"red", "pink", "orange"}, {"purple", "pink", "navy"}, {"yellow", "orange", "beige"}, {"green", "teal"}]


def top_colour(frame, box):
    """The main colour of the top of the person in `box` (x1, y1, x2, y2 in pixels): the upper back /
    chest, not the head (hairnet) or the legs."""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    a, b = int(y1 + 0.18 * h), int(y1 + 0.5 * h)
    c, d = int(x1 + 0.2 * w), int(x2 - 0.2 * w)
    patch = frame[max(0, a):max(a + 1, b), max(0, c):max(c + 1, d)]
    if patch.size == 0:
        return "other"
    if patch.shape[0] * patch.shape[1] > 1600:
        patch = cv2.resize(patch, (40, 40), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(patch.astype(np.float32) / 255, cv2.COLOR_BGR2Lab).reshape(-1, 3)
    nearest = np.argmin(((lab[:, None, :] - _LAB[None, :, :]) ** 2).sum(-1), axis=1)
    counts = np.bincount(nearest, minlength=len(NAMES))
    return NAMES[int(counts.argmax())]


def distance(a, b):
    """0 the same colour, 0.5 easily confused, 1 different; 0.7 when either is 'patterned' / 'other'."""
    if a == b:
        return 0.0
    if a in ("patterned", "other") or b in ("patterned", "other"):
        return 0.7
    return 0.5 if any(a in g and b in g for g in NEAR) else 1.0
