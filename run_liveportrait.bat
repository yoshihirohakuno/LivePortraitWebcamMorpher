@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set PATH=%~dp0ffmpeg;%PATH%
".venv\Scripts\python.exe" app.py --server-name 127.0.0.1 --server-port 8890
