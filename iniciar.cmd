@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 ou superior antes de iniciar.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto fail
)
call npm run build
if errorlevel 1 goto fail
echo Abra http://localhost:3000 no navegador.
call npm start
pause
exit /b
:fail
echo Nao foi possivel iniciar. Confira a mensagem acima.
pause
exit /b 1
