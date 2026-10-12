@echo off
title GLOBAL COMMAND server
cd /d "%~dp0"
start "" http://localhost:8080
node server.js
