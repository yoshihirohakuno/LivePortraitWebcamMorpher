$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PATH = "$PSScriptRoot\ffmpeg;$env:PATH"

& "$PSScriptRoot\.venv\Scripts\python.exe" app.py --server-name 127.0.0.1 --server-port 8890
