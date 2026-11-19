@echo off
setlocal
rem ============================================================
rem  Duo Indumentaria - Paños del rollo a JPG de 300 dpi
rem  Uso: arrastrar el PDF del rollo (una pagina por paño) sobre
rem  este archivo. Sale un JPG por paño al lado del PDF:
rem    rollo-xxxx-pano01.jpg, rollo-xxxx-pano02.jpg, ...
rem  Requiere Ghostscript (gratis): https://ghostscript.com/releases/gsdnld.html
rem ============================================================

set "GS="
for /f "delims=" %%G in ('where gswin64c 2^>nul') do set "GS=%%G"
if not defined GS for /d %%D in ("C:\Program Files\gs\gs*") do if exist "%%D\bin\gswin64c.exe" set "GS=%%D\bin\gswin64c.exe"
if not defined GS (
  echo No se encontro Ghostscript. Instalalo desde https://ghostscript.com/releases/gsdnld.html
  echo ^(version de 64 bits para Windows^) y volve a probar.
  pause
  exit /b 1
)

if "%~1"=="" (
  echo Arrastra el PDF del rollo sobre este archivo.
  pause
  exit /b 1
)

for %%F in (%*) do (
  echo.
  echo Convirtiendo %%~nxF a JPG 300 dpi ^(puede tardar 1 o 2 minutos por paño^)...
  "%GS%" -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=jpeg -r300 -dJPEGQ=95 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="%%~dpnF-pano%%02d.jpg" "%%~fF"
  if errorlevel 1 (
    echo Hubo un error convirtiendo %%~nxF
  ) else (
    echo Listo: %%~dpnF-pano01.jpg, -pano02.jpg, ...
  )
)
echo.
pause
