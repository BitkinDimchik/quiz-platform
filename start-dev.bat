@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0ensure-deps.bat" goto MISSING
if not exist "%~dp0scripts\ensure-native-modules.js" goto MISSING

call "%~dp0ensure-deps.bat"
if errorlevel 1 goto STOP

set "APP_URL=http://localhost:5173"
set "OPEN_BROWSER=1"

title quiz-platform (dev)
echo.
echo   App: %APP_URL%
echo.
if "%OPEN_BROWSER%"=="1" (
  start "open-browser" cmd /c "timeout /t 12 /nobreak >nul && start %APP_URL%"
  echo   Browser will open in ~12s (after API is up). Refresh if needed.
  echo.
)
echo Starting npm run start:dev ...
echo.
call npm.cmd run start:dev
if errorlevel 1 goto RUN_FAIL
goto :eof

:MISSING
echo.
echo   Missing ensure-deps.bat or scripts\ensure-native-modules.js
echo   Copy them into this folder next to start-dev.bat
echo.
pause
exit /b 1

:RUN_FAIL
echo.
echo Exit with error. Press any key to close.
pause >nul
exit /b 1

:STOP
exit /b 1
