@echo off
rem Draw the kitchen zones on a camera picture (zones.py). Same area on two cameras = same name.
cd /d "%~dp0"
python zones.py %*
pause
