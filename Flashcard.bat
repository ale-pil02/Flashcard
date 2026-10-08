@echo off
cd /d "%~dp0"
start "" "http://localhost:8010"
echo Avvio Flashcard in corso... non chiudere questa finestra!
py server.py 8010
