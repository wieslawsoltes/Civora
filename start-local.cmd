@echo off
cd /d "%~dp0"
node scripts\build.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
node scripts\local.mjs --open %*
if errorlevel 1 pause
