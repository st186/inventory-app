# Camera watcher

Runs on a PC on the same Wi-Fi (2.4 GHz band) as a Tapo camera and sends stills to the Bunny server
(`supabase/functions/make-server-c2dd9b9d/cctv.ts`): in working hours one every N minutes for the
cap / gloves / apron check; outside them, a still whenever something moves (anyone in view who
isn't checked in there is an "after hours" alert). Alerts and settings: app › More › Cameras.

- Needs Python 3 with OpenCV (`pip install opencv-python`).
- Settings: `%LOCALAPPDATA%\BunnyCamera\camera_watch.ini` (camera id, its key from the app, and
  the RTSP links with the Tapo camera account). Never put it in this folder.
- Log: `%LOCALAPPDATA%\BunnyCamera\camera_watch.log`.
- One PC can watch several cameras: one `[camera:<id>]` section each (a thread per camera).
- New PC (the store): copy the kit (this folder + its camera_watch.ini) and double-click
  `Install Bunny cameras.bat` - it asks for the camera account and IPs, installs Python + OpenCV,
  copies the program to C:\BunnyCamera and makes it start with Windows.
- Run without a window: `pythonw camera_watch.py`. It starts with Windows from
  `shell:startup\Bunny camera watcher.bat`.
- Tapo C200 links: `rtsp://USER:PASS@IP:554/stream1` (full) and `/stream2` (small). The PC must
  reach the camera: on the Airtel router that means the PC on the 2.4 GHz band too (or on a cable).

## Recording for our own kitchen dataset (owner, 29 Oct 2026)

`recorder.py` records each camera's own video, untouched and without sound, in 30-minute pieces:
`D:\BunnyCamera\recordings\<camera>\<date>\HH-MM-SS.mp4`, plus one `still.jpg` a day. The times,
days and folder are in the `[record]` section of `camera_watch.ini`. The first run is 8 AM to 8 PM,
30 Oct to 5 Nov 2026, and it stops by itself after that. It needs FFmpeg (`winget install Gyan.FFmpeg`)
and starts with Windows from the same Startup file as the watcher. It stops if the disk has less than
15 GB free. Log: `recorder.log`.

The kitchen activity bursts keep running while it records; the camera serves both.

### Zones (areas of the kitchen)

`Draw kitchen zones.bat` (`zones.py`) shows a camera's picture:

1. Click around an area, such as the folding table, dough machine or steamer.
2. Press Enter and give it a name.
3. Press `s` to save.

Use the **same name** for the same area on every camera that sees it. Two cameras whose views overlap
then agree on where someone is, and a person seen there by both is counted once. The zones are saved
in `%LOCALAPPDATA%\BunnyCamera\zones\<camera>.json`, with points as fractions of the picture, and
`zones\place.json` lists which cameras see each zone. To add a camera, add a `[camera:<id>]`
section; the recorder picks it up when it starts again (blank `cameras =` means all of them).

### Bursts kept for the kitchen model

Every kitchen-activity burst with people in it is also kept on the PC, next to the recordings:
`D:\BunnyCamera\bursts\<camera>\<date>\HH-MM-SS\` (the 20 frames as sent, and `look.json` with the frame
times and the server's reading of each frame: top colour, where, an activity per frame). These are the
first labels for the kitchen model in `tools/kitchen-ai`, which trains and runs on this PC.
