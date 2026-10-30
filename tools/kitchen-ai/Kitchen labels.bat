@echo off
rem Bunny Momos kitchen model: the labelling page, http://localhost:8765 (opens in the browser).
rem Keys: 1-9 what they're doing, o = other, Enter = agree with the suggestion, 0 = not a person, Backspace = back.
rem Close this window when you're done.
python "%~dp0ka.py" label
pause
