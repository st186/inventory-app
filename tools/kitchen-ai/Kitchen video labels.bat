@echo off
rem Bunny Momos kitchen model: the video labelling page, http://localhost:8765/rows (opens in the browser).
rem Pick a day and a person, tap a picture to watch those 5 seconds, Shift-tap (or "Select to here")
rem for a stretch, then press what they were doing: 1-9, o = other, 0 = not a person, Delete = clear.
rem Type your name at the top first - it is saved with every label. Close this window when you're done.
python "%~dp0ka.py" label --video
pause
