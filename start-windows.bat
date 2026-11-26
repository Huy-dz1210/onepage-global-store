@echo off
chcp 65001 >nul
title Onepage Global Store
cd /d "%~dp0"

echo === Onepage Global Store ===
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [1/5] Tao file .env tu .env.example
  copy ".env.example" ".env" >nul
) else (
  echo [1/5] Da co file .env
)

echo [2/5] Kiem tra PostgreSQL o cong 5432...
powershell -NoProfile -Command "if (-not (Test-NetConnection localhost -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue)) { exit 1 }"
if errorlevel 1 (
  echo [LOI] Khong ket noi duoc PostgreSQL tai localhost:5432.
  echo   - Neu da cai PostgreSQL: mo Services, bat dich vu postgresql-x64-...
  echo   - Neu dung Docker: mo Docker Desktop roi chay: docker compose up -d
  echo   - Neu chua cai: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
  pause
  exit /b 1
)

if not exist "node_modules\.bin\prisma.cmd" (
  echo [3/5] Cai thu vien - lan dau mat 1-3 phut...
  call npm install
  if errorlevel 1 goto :err
) else (
  echo [3/5] Thu vien da cai
)

echo [4/5] Tao/cap nhat bang trong database + du lieu mau...
call npx prisma db push
if errorlevel 1 goto :err
call npx prisma db seed
if errorlevel 1 goto :err

echo [5/5] Khoi dong app tai http://localhost:3000
echo   Dang nhap: user1@onepage.demo / 123456   -   admin@onepage.demo / admin123
echo   Bam Ctrl+C de dung.
echo.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
call npm run dev
goto :eof

:err
echo.
echo [LOI] Co loi o buoc tren. Chup man hinh / copy noi dung loi gui de duoc ho tro.
echo   - P1000 Authentication failed: sua mat khau trong file .env (DATABASE_URL)
pause
exit /b 1
