@echo off
cd /d "%~dp0"
where php >nul 2>nul
if %errorlevel%==0 (
  set PHPEXE=php
) else if exist "C:\xampp\php\php.exe" (
  set PHPEXE=C:\xampp\php\php.exe
) else (
  echo PHP was not found. Install XAMPP or add PHP to PATH. See README.md
  pause
  exit /b 1
)
echo Open  http://localhost:8000  in your browser. Press Ctrl+C to stop.
"%PHPEXE%" -S localhost:8000 router.php
