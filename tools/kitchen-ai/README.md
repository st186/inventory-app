# Kitchen model (runs on the kitchen PC, not in the app)

Learns what each person in the production kitchen is doing (folding, machine, prep = cutting veg,
filling, cooking, packing, cleaning, phone, idle, other) from our own recordings, and runs on this PC. Video, crops
and labels never leave the PC; only the numbers are meant to reach the Bunny server, the same way
the camera watcher's are. Nothing here is built into the app or the website.

## How it works

1. **Person finder** (YOLOX-S, Apache 2.0) draws a box round everyone in a frame (and phones).
2. **Picture reader** (DINOv2-small, Apache 2.0) turns each person's crop into 384 numbers.
3. Added to those: how much they moved in the next second, the zone their feet are in (zones drawn
   with `tools/cctv/Draw kitchen zones.bat`), a phone in their box, and the shape of the box.
4. **Our model** (`kai/learn.py`, numpy, no PyTorch) learns from labels which activity that is.
   Labels come from Bunny's burst readings (the camera watcher now keeps every burst with people in
   it, with the server's reading of each frame) and from you on the labelling page; yours count fully,
   Bunny's 0.4. The score is checked on hours the model never trained on.
5. People are followed from look to look and named by the colour of their top, the same colours
   Bunny uses, so the app's Who is who card can put a name to each.
6. **Numbered people for the app** (`kai/people.py` BurstNumbers, used by `tools/cctv/camera_watch.py`,
   owner 30 Oct 2026): every burst's people are found here and a numbered box is drawn round each
   before the burst goes to the server, with a small crop and a Who-is-who photo per number. Bunny
   compares the boxes with the crops of the people seen earlier that day and keeps each person under
   one day number ("Person 3") - two people in the same colour are no longer mixed up. The burst kept
   on the PC (`bursts\...\look.json`) gets the boxes and each box's day number: free who-is-who
   labels for the model. If the models aren't set up, bursts go the old way.

7. **Video labels, by the people working** (`kai/rows.py`, `kai/rowsui.py`, `kai/clips.py`, owner
   30 Oct 2026: label clips with the team rather than trust Bunny's bursts). Every recorded day is
   followed 5 frames a second: each person's boxes are linked into pieces (overlap with the box 0.2 s
   before, and the same top colours, so two people crossing aren't swapped), and pieces into people
   (alike and under a minute apart; the labelling page suggests longer joins). The page
   (`Kitchen video labels.bat`, http://localhost:8765/rows) shows one person at a time as a picture
   every 5 s; tap to watch those 5 seconds, select a stretch, press what they were doing. Each label
   keeps the labeller's name. The **Day timeline** tab shows everyone's day in one picture.
   `ka.py clips` then cuts each labelled stretch into 2-second clips of that one person (256 x 256,
   a square round their boxes with room for the table or machine), a folder per activity:
   `clips\<activity>\<camera>_<date>_<time>_<who>.mp4` + `clips\index.csv` - the input for a video
   model (SlowFast, or a frozen V-JEPA 2 with a small head).

The two ready-made models run with onnxruntime on the CPU (fast enough); the RTX 3050 is used if
`onnxruntime-directml` is installed instead. Following a whole day for the video labels takes about
5 hours on the CPU (the person finder at 5 frames a second), so it runs last in the evening job.

## Where things are

| What | Where |
|---|---|
| Recordings (recorder.py) | `D:\BunnyCamera\recordings\<camera>\<date>\HH-MM-SS.mp4` |
| Bursts with Bunny's labels (camera_watch.py) | `D:\BunnyCamera\bursts\<camera>\<date>\HH-MM-SS\` |
| Dataset (frames, people, labels) | `D:\BunnyCamera\dataset\kai.sqlite` + crops, frames |
| Trained models | `D:\BunnyCamera\models\kitchen-YYYYMMDD-HHMM\` (`current.json` = in use) |
| Video rows (people followed, pictures, labels) | `D:\BunnyCamera\rows\<camera>\<date>.sqlite` |
| Labelled clips for a video model | `D:\BunnyCamera\clips\<activity>\*.mp4`, `clips\index.csv` |
| Day reports and per-minute CSVs | `D:\BunnyCamera\reports\`, `D:\BunnyCamera\activity\` |
| Downloaded models | `%LOCALAPPDATA%\BunnyCamera\models\` |
| Settings | `[kitchen_ai]` in `%LOCALAPPDATA%\BunnyCamera\camera_watch.ini` (see `kai/config.py`) |

## Steps

```
python ka.py setup --yes        # once: download the two models (~125 MB)
python ka.py harvest 2026-10-31 # a recorded day into the dataset (a frame every 10 s)
python ka.py prelabel           # Bunny's burst labels onto the people found
Kitchen labels.bat              # you: check labels, http://localhost:8765 (keys 1-9, o, Enter, 0, Backspace)
python ka.py train              # train, and see the score on unseen hours
python ka.py day 2026-11-01     # a day judged, next to Bunny's bursts (opens a report)
python ka.py run                # live, after the recording week (writes a line per person per minute)
python ka.py status             # what's ready
python ka.py rows 2026-10-31    # everyone followed through a day, for the video labels (--only 13-51: one recording)
Kitchen video labels.bat        # label stretches of video with the team, http://localhost:8765/rows
python ka.py clips              # the labelled stretches as 2-second clips, a folder per activity
```

Tests (stand-in models, no downloads): `python tests/test_kai.py`.

## Plan

- **30 Oct to 5 Nov:** recording 8 AM to 8 PM; bursts kept with their labels.
- **Each evening or after 5 Nov:** harvest + prelabel; you label 30 to 45 minutes (a few hundred people).
- **Then:** train; compare `day` reports with Bunny's bursts for a week; run live.
- **Last:** send the per-minute numbers to the server and switch the app's Kitchen activity graphs
  over (a small server route, when the model has earned it).
