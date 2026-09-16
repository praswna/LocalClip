@echo off
setlocal
cd /d "%~dp0"

set "LOCALCLIP_PNPM="
set "LOCALCLIP_NODE_DIR="

where node.exe >nul 2>nul
if not %errorlevel%==0 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "LOCALCLIP_NODE_DIR=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
)

where node.exe >nul 2>nul
if not %errorlevel%==0 (
  echo [LocalClip] Node.js was not found.
  echo Install Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)

where pnpm.cmd >nul 2>nul
if %errorlevel%==0 set "LOCALCLIP_PNPM=pnpm.cmd"

if not defined LOCALCLIP_PNPM if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" set "LOCALCLIP_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if not defined LOCALCLIP_PNPM (
  echo [LocalClip] pnpm was not found.
  echo Install Node.js and pnpm, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.modules.yaml" goto :install
goto :check_electron

:install
echo [LocalClip] Preparing the first launch...
call "%LOCALCLIP_PNPM%" install
if errorlevel 1 goto :failed

:check_electron
if not exist "node_modules\electron\dist\electron.exe" goto :repair
goto :launch

:repair
echo [LocalClip] Repairing an incomplete installation...
call "%LOCALCLIP_PNPM%" install --force
if errorlevel 1 goto :failed

:launch

if defined LOCALCLIP_DRY_RUN (
  echo [LocalClip] Launcher check passed.
  exit /b 0
)

echo [LocalClip] Starting the app...
call "%LOCALCLIP_PNPM%" desktop
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo [LocalClip] Could not start. Check the error message above.
pause
exit /b 1
