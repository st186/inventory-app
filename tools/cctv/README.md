# Camera watcher

Runs on a PC on the same Wi-Fi (2.4 GHz band) as a Tapo camera and sends stills to the Bunny server
(`supabase/functions/make-server-c2dd9b9d/cctv.ts`): in working hours one every N minutes for the
cap / gloves / apron check; outside them, a still whenever something moves (anyone in view who
isn't checked in there is an "after hours" alert). Alerts and settings: app › More › Cameras.

- Needs Python 3 with OpenCV (`pip install opencv-python`).
- Settings: `%LOCALAPPDATA%\BunnyCamera\camera_watch.ini` (camera id, its key from the app, and
  the RTSP links with the Tapo camera account). Never put it in this folder.
- Log: `%LOCALAPPDATA%\BunnyCamera\camera_watch.log`.
- Run without a window: `pythonw camera_watch.py`. It starts with Windows from
  `shell:startup\Bunny camera watcher.bat`.
- Tapo C200 links: `rtsp://USER:PASS@IP:554/stream1` (full) and `/stream2` (small). The PC must
  reach the camera: on the Airtel router that means the PC on the 2.4 GHz band too (or on a cable).
