@echo off
setlocal
cd /d "%~dp0"

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo csc.exe not found. Need .NET Framework 4.x
  exit /b 1
)

"%CSC%" /nologo /optimize /target:exe /out:"%~dp0..\..\Quiz.exe" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "%~dp0QuizLauncher.cs"
if errorlevel 1 exit /b 1
echo Built Quiz.exe
