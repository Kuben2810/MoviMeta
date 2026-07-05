@echo off
cd /d "%~dp0"
title CineSync Movie Dashboard
echo Starting CineSync Server...
node server.js
pause
