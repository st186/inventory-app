@echo off
rem Bunny Momos kitchen model: makes Windows run the evening job every day at 8:45 PM, after the
rem recording stops - new recordings into the dataset and Bunny's burst labels on them.
rem Log: D:\BunnyCamera\kitchen-ai.log
rem To stop it later: schtasks /Delete /TN "Bunny kitchen model nightly" /F
set PYW=%LOCALAPPDATA%\Python\pythoncore-3.14-64\pythonw.exe
if not exist "%PYW%" (echo Python not found at %PYW% & pause & exit /b 1)
schtasks /Create /TN "Bunny kitchen model nightly" /SC DAILY /ST 20:45 /TR "\"%PYW%\" \"%~dp0ka.py\" nightly" /F
if errorlevel 1 (echo Could not set it up.) else (echo Done: the kitchen model's evening job runs every day at 8:45 PM.)
pause
