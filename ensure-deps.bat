@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto NEED_NODE

echo   Node.js:
node -v

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo   Created .env from .env.example
)

if not exist "node_modules\" goto INSTALL

echo   Checking / fixing better-sqlite3 / bcrypt for this Node...
call node "%~dp0scripts\ensure-native-modules.js"
if errorlevel 1 goto REINSTALL
goto WEB

:NEED_NODE
echo.
echo   Need Node.js 20 or 22 LTS (24/26 also ok if rebuild works): https://nodejs.org
echo   Install it, then run this file again.
echo.
pause
exit /b 1


:REINSTALL
echo.
echo   Rebuild failed. Reinstalling packages...
echo.
call :wipe_modules
if errorlevel 1 goto WIPE_FAIL

:INSTALL
echo   Installing packages...
call npm install
if errorlevel 1 goto INSTALL_FAIL

echo   Checking better-sqlite3 / bcrypt after install...
call node "%~dp0scripts\ensure-native-modules.js"
if errorlevel 1 goto NATIVE_FAIL

:WEB
if not exist "web\package.json" goto WEB_MISSING
if not exist "web\node_modules\vite\bin\vite.js" goto WEB_INSTALL
exit /b 0

:WEB_INSTALL
echo   Installing web packages...
call npm install --prefix "%~dp0web"
if errorlevel 1 goto WEB_FAIL
if not exist "web\node_modules\vite\bin\vite.js" goto WEB_FAIL
exit /b 0

:WEB_MISSING
echo   Missing web\package.json. Copy the web folder without web\node_modules.
pause
exit /b 1

:WIPE_FAIL
echo   Could not delete node_modules. Close other Node windows and retry.
pause
exit /b 1

:INSTALL_FAIL
echo.
echo   npm install failed.
echo   Prefer Node.js 22 LTS: https://nodejs.org
echo   Visual Studio Build Tools may be needed if prebuild is missing.
echo.
pause
exit /b 1

:NATIVE_FAIL
echo.
echo   better-sqlite3 or bcrypt still failed to load.
echo   Install Node.js 22 LTS from https://nodejs.org and retry.
echo   Or run Quiz.exe (bundles Node 22).
echo.
pause
exit /b 1

:WEB_FAIL
echo   Failed to install web packages.
pause
exit /b 1

:wipe_modules
if not exist "node_modules\" exit /b 0
echo   Removing node_modules...
attrib -r -s -h "node_modules\*" /s /d >nul 2>&1
rmdir /s /q "node_modules" 2>nul
if not exist "node_modules\" exit /b 0
set "EMPTY=%TEMP%\quiz-empty-nm"
if exist "%EMPTY%" rmdir /s /q "%EMPTY%" 2>nul
mkdir "%EMPTY%" >nul 2>&1
robocopy "%EMPTY%" "node_modules" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS >nul
rmdir /s /q "node_modules" 2>nul
rmdir /s /q "%EMPTY%" 2>nul
if exist "node_modules\" exit /b 1
exit /b 0
