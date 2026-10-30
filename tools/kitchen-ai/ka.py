"""Bunny Momos kitchen model - runs on the kitchen PC, separate from the app (owner, 30 Oct 2026).

    python ka.py status                 what's ready: models, recordings, bursts, labels, trained model
    python ka.py setup --yes            download the two ready-made models (~125 MB, once)
    python ka.py harvest [DATE]         frames every 10 s from a recorded day into the dataset
    python ka.py prelabel [DATE]        Bunny's burst readings as first labels (all days if no date)
    python ka.py label                  the labelling page, http://localhost:8765
    python ka.py train                  train on the labels, report the score on unseen hours
    python ka.py day DATE               judge a recorded day, next to Bunny's bursts (HTML report)
    python ka.py run [--minutes N]      watch the kitchen live, a line per person per minute
    python ka.py nightly                every recorded day not done yet + Bunny's labels (+ today's report
                                        once a model is trained); Windows runs it at 8:45 PM, log in
                                        <root>\\kitchen-ai.log

DATE is YYYY-MM-DD (yesterday if left out). Settings: camera_watch.ini ([kitchen_ai], see kai/config.py).
"""
import argparse
import json
import os
import sys
from datetime import date as Date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kai import config, models  # noqa: E402


def _yesterday():
    return (Date.today() - timedelta(days=1)).isoformat()


def _looker(s, cam):
    from kai import zones
    from kai.look import Looker
    missing = [f.name for f in models.ALL if models.check(s.models, f)]
    if missing:
        raise SystemExit(f"Models not downloaded yet ({', '.join(missing)}): run  python ka.py setup --yes")
    finder = models.Finder(models.path_of(s.models, models.FINDER))
    reader = models.Reader(models.path_of(s.models, models.READER))
    return Looker(finder, reader, zones.load(s.zones, cam), s.width, s.min_score)


def _store(s):
    from kai.store import Store
    return Store(s.dataset)


def _current_model(s):
    from kai.learn import Model
    ptr = os.path.join(s.trained, "current.json")
    if not os.path.exists(ptr):
        raise SystemExit("No trained model yet: label some people, then  python ka.py train")
    with open(ptr, encoding="utf-8") as f:
        return Model.load(os.path.join(s.trained, json.load(f)["name"]))


def cmd_status(s, a):
    cam = s.camera(a.camera)["id"]
    print(f"Camera {cam} - data in {s.root}")
    for f in models.ALL:
        print(f"  model {f.name}: {models.check(s.models, f) or 'ready'}")
    rec = os.path.join(s.recordings, cam)
    days = sorted(os.listdir(rec)) if os.path.isdir(rec) else []
    print(f"  recorded days: {', '.join(days) or 'none'}")
    from kai import bursts
    b = bursts.burst_folders(s.bursts, cam)
    with_labels = sum(1 for x in b if bursts.read(x).get("people"))
    print(f"  bursts kept: {len(b)} ({with_labels} with Bunny's labels)")
    if os.path.exists(os.path.join(s.dataset, "kai.sqlite")):
        st = _store(s).stats()
        print(f"  dataset: {st['frames']} frames, {st['people']} people, labels yours {st['yours']} / Bunny's {st['bunny']}")
    ptr = os.path.join(s.trained, "current.json")
    print(f"  trained model: {json.load(open(ptr, encoding='utf-8'))['name'] if os.path.exists(ptr) else 'none yet'}")


def cmd_setup(s, a):
    todo = [f for f in models.ALL if models.check(s.models, f)]
    if not todo:
        print("Both models are already downloaded.")
        return
    total = sum(f.size for f in todo) / 1e6
    if not a.yes:
        print(f"This downloads {total:.0f} MB into {s.models}:")
        for f in todo:
            print(f"  {f.name}  {f.size / 1e6:.1f} MB  from {f.url}")
        print("Run again with --yes to go ahead.")
        return
    for f in todo:
        models.download(s.models, f)


def cmd_harvest(s, a):
    from kai import jobs
    cam = s.camera(a.camera)["id"]
    jobs.harvest(s, _store(s), _looker(s, cam), cam, a.date or _yesterday())


def cmd_prelabel(s, a):
    from kai import jobs
    cam = s.camera(a.camera)["id"]
    jobs.prelabel(s, _store(s), _looker(s, cam), cam, a.date)


def cmd_label(s, a):
    from kai import labelui
    labelui.serve(_store(s), s.port, open_browser=not a.no_browser)


def _train(s, store, say=print):
    """Train on every label so far, make it the model in use, and save its guesses for everyone."""
    from kai import jobs, learn
    rows = store.training_rows()
    model, report = learn.train(rows, store.feat, ai_weight=s.ai_weight)
    folder = os.path.join(s.trained, model.name)
    model.save(folder, report)
    with open(os.path.join(s.trained, "current.json"), "w", encoding="utf-8") as f:
        json.dump({"name": model.name}, f)
    say(f"Trained {model.name} on {len(rows)} people ({report['labels']['yours']} yours, {report['labels']['bunny']} Bunny's).")
    for key, title in (("vsYours", "against your labels"), ("vsBunny", "against Bunny's")):
        r = report.get(key)
        if r:
            say(f"  on hours it never saw, {title}: {r['accuracy']:.0%} right (macro F1 {r['macroF1']:.2f}, {r['n']} people)")
            for act, v in r["perClass"].items():
                say(f"    {act:<9} {v['n']:>5}  found {v['recall']:.0%}  right when it says so {v['precision']:.0%}")
    jobs.predict_all(store, model, say=say)
    return model


def cmd_train(s, a):
    store = _store(s)
    n = len(store.training_rows())
    if n < 50:
        raise SystemExit(f"Only {n} labelled people so far - label at least 50 (a few hundred is better).")
    _train(s, store)


def cmd_day(s, a):
    from kai import jobs
    cam = s.camera(a.camera)["id"]
    path = jobs.day(s, _looker(s, cam), _current_model(s), cam, a.date or _yesterday())
    if not a.no_browser:
        import webbrowser
        webbrowser.open(path)


DOCS_HEATMAPS = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "Bunny Momos", "Bunny Momos Docs",
                             "3 Projects", "Kitchen Fit-out", "Movement heatmaps")


def _heatmaps(s, store, cam, dates, say=print):
    """The movement report for those days, kept in <root>\\reports\\heatmaps and copied to the Docs
    folder (Kitchen Fit-out) so it opens on the phone too."""
    import glob
    import shutil
    from kai import heatmap
    pic = os.path.join(s.zones, f"{cam}.jpg")
    if not os.path.exists(pic):
        pic = os.path.join(s.recordings, cam, dates[-1], "still.jpg")
    out = os.path.join(s.reports, "heatmaps")
    path = heatmap.build(store, cam, dates, pic, s.zones, out, s.step_sec)
    if not path:
        say(f"no movement recorded for {dates[0]}..{dates[-1]}")
        return None
    if os.path.isdir(os.path.dirname(DOCS_HEATMAPS)):
        os.makedirs(DOCS_HEATMAPS, exist_ok=True)
        stem = os.path.splitext(os.path.basename(path))[0]
        for f in glob.glob(os.path.join(out, stem + "*")):
            shutil.copy2(f, DOCS_HEATMAPS)
    say(f"movement report: {path}")
    return path


def cmd_heatmap(s, a):
    cam = s.camera(a.camera)["id"]
    first = a.date or Date.today().isoformat()
    last = a.to or first
    days = [d for d in sorted(os.listdir(os.path.join(s.recordings, cam))) if first <= d <= last] if os.path.isdir(os.path.join(s.recordings, cam)) else []
    path = _heatmaps(s, _store(s), cam, days or [first])
    if path and not a.no_browser:
        import webbrowser
        webbrowser.open(path)


def cmd_run(s, a):
    from kai import jobs
    c = s.camera(a.camera)
    url = c["still_url"] if s.live_stream == "still" else c["watch_url"]
    jobs.live(s, _looker(s, c["id"]), _current_model(s), c["id"], url, minutes=a.minutes)


NIGHTLY_TRAIN_FROM = 200  # labels needed before the evening job trains a model on its own


def cmd_nightly(s, a):
    """The evening job (Task Scheduler, 8:45 PM, after the recording stops): new recordings into the
    dataset, Bunny's burst labels onto them, the zones worked out again (in case they were redrawn),
    a fresh model once there are enough labels (Bunny's alone at first, yours as they come), its
    guesses for the labelling page, and today's report next to Bunny's bursts."""
    import time
    import traceback
    from datetime import datetime
    from kai import jobs
    os.makedirs(s.root, exist_ok=True)
    log_path = os.path.join(s.root, "kitchen-ai.log")

    def say(msg):
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S}  {msg}\n")

    t0 = time.time()
    try:
        cam = s.camera(a.camera)["id"]
        store, looker = _store(s), _looker(s, cam)
        rec = os.path.join(s.recordings, cam)
        for d in sorted(os.listdir(rec)) if os.path.isdir(rec) else []:
            jobs.harvest(s, store, looker, cam, d, say=say)
        jobs.prelabel(s, store, looker, cam, None, say=say)
        jobs.rezone(s, store, cam, say=say)
        days = sorted(os.listdir(rec)) if os.path.isdir(rec) else []
        if Date.today().isoformat() in days:
            _heatmaps(s, store, cam, [Date.today().isoformat()], say=say)
        if len(days) > 1:
            _heatmaps(s, store, cam, days, say=say)  # every recorded day together
        trained = len(store.training_rows()) >= NIGHTLY_TRAIN_FROM
        if trained:
            _train(s, store, say=say)
        if os.path.exists(os.path.join(s.trained, "current.json")):
            model = _current_model(s)
            if not trained:
                jobs.predict_all(store, model, say=say)  # guesses for the people added tonight
            today = Date.today().isoformat()
            if os.path.isdir(os.path.join(rec, today)):
                jobs.day(s, looker, model, cam, today, say=say)
        st = store.stats()
        say(f"nightly done in {time.time() - t0:.0f} s: {st['people']} people in the dataset, labels yours {st['yours']} / Bunny's {st['bunny']}")
    except BaseException:  # noqa: BLE001 - the log is the only place anyone will see it
        say("nightly failed:\n" + traceback.format_exc())
        raise


def main(argv=None):
    p = argparse.ArgumentParser(description="Bunny Momos kitchen model")
    p.add_argument("--camera", help="camera id (the first in camera_watch.ini if left out)")
    p.add_argument("--root", help="data folder (default: next to the recordings, D:\\BunnyCamera)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    x = sub.add_parser("setup")
    x.add_argument("--yes", action="store_true")
    for name in ("harvest", "prelabel", "day"):
        x = sub.add_parser(name)
        x.add_argument("date", nargs="?")
        if name == "day":
            x.add_argument("--no-browser", action="store_true")
    x = sub.add_parser("label")
    x.add_argument("--no-browser", action="store_true")
    sub.add_parser("train")
    x = sub.add_parser("run")
    x.add_argument("--minutes", type=float)
    sub.add_parser("nightly")
    x = sub.add_parser("heatmap")
    x.add_argument("date", nargs="?")
    x.add_argument("--to", help="last day (YYYY-MM-DD) for several days together")
    x.add_argument("--no-browser", action="store_true")
    a = p.parse_args(argv)
    s = config.load(root=a.root)
    {"status": cmd_status, "setup": cmd_setup, "harvest": cmd_harvest, "prelabel": cmd_prelabel, "label": cmd_label,
     "train": cmd_train, "day": cmd_day, "run": cmd_run, "nightly": cmd_nightly, "heatmap": cmd_heatmap}[a.cmd](s, a)


if __name__ == "__main__":
    main()
