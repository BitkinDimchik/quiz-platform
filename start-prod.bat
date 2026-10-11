@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0ensure-deps.bat" goto MISSING
if not exist "%~dp0scripts\ensure-native-modules.js" goto MISSING

where node >nul 2>&1
if not errorlevel 1 (
  node "%~dp0print-lan-urls.js"
)

call "%~dp0ensure-deps.bat"
if errorlevel 1 goto STOP

echo   Checking port 3000...
node "%~dp0check-port.js" 3000
if errorlevel 1 goto PORT_BUSY

set "APP_URL=http://localhost:3000"
set "OPEN_BROWSER=1"

title quiz-platform
echo.
echo   After start open: %APP_URL%
echo   Not 5173 - that port is only for start-dev.bat
echo   Close start-dev.bat first if it is still running.
echo   Players: same Wi-Fi, address on the host screen.
echo.
if not exist "web\package.json" goto NO_WEB
if not exist "web\src\main.tsx" goto NO_WEB
if not exist "web\vite.config.ts" goto NO_WEB

echo Building...
del /q "tsconfig.build.tsbuildinfo" >nul 2>&1
call npm run build
if errorlevel 1 goto BUILD_FAIL
if exist "dist\src" rmdir /s /q "dist\src" 2>nul
if not exist "dist\main.js" goto NO_DIST
echo.
if "%OPEN_BROWSER%"=="1" (
  start "open-browser" cmd /c "timeout /t 3 /nobreak >nul && start %APP_URL%"
  echo   Browser will open in ~3s.
  echo.
)
echo Starting npm run start:prod ...
set "NODE_ENV=production"
call npm.cmd run start:prod
if errorlevel 1 goto RUN_FAIL
goto :eof

:MISSING
echo.
echo   Missing ensure-deps.bat or scripts\ensure-native-modules.js
echo   Copy them into this folder next to start-prod.bat
echo.
pause
exit /b 1

:PORT_BUSY
echo.
echo   Port 3000 is busy, so start-prod.bat cannot start.
echo   Close the start-dev.bat window, wait 2 seconds, then run start-prod.bat.
echo.
pause
exit /b 1

:NO_WEB
echo.
echo   Incomplete web folder. Copy web\package.json, web\src and web\vite.config.ts
echo   Do not skip the web folder when making the zip. Skip only web\node_modules and web\dist.
echo.
pause
exit /b 1

:NO_DIST
echo.
echo   Build finished, but dist\main.js is missing.
echo   Nest should emit dist\main.js (not dist\src\main.js).
echo   Close other Node windows and run start-prod.bat again.
echo.
pause
exit /b 1

:BUILD_FAIL
echo.
echo Build failed. Press any key to close.
pause >nul
exit /b 1

:RUN_FAIL
echo.
echo Exit with error. Press any key to close.
pause >nul
exit /b 1

:STOP
exit /b 1
