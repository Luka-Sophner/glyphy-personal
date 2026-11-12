@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Glyphy - Android APK
where node >nul 2>&1
if errorlevel 1 (
  echo Не найден Node.js. Установите Node.js LTS с https://nodejs.org/
  echo Затем снова откройте этот файл. Подробности: INSTALL_ANDROID.md
  pause
  exit /b 1
)
echo Сборка Glyphy. При первом запуске понадобится интернет для загрузки инструментов.
node scripts\build-android.mjs
if errorlevel 1 (
  echo.
  echo APK не собран. Причина указана выше. Откройте INSTALL_ANDROID.md
  pause
  exit /b 1
)
echo.
echo Готово: %~dp0APK\Glyphy-debug.apk
echo Перенесите APK на телефон и откройте его для установки.
pause
