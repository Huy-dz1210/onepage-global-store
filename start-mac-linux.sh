#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Chưa cài Node.js 22: https://nodejs.org"; exit 1; }
[ -f .env ] || cp .env.example .env
[ -x node_modules/.bin/prisma ] || npm install
npx prisma db push
npx prisma db seed
echo "Mở http://localhost:3000  –  user1@onepage.demo / 123456  •  admin@onepage.demo / admin123"
npm run dev
