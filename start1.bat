@echo off
echo Starting SMART on FHIR App...
echo Launching backend and frontend dev servers in a split Windows Terminal...

wt --title "SMART ON FHIR APP" ^
-d "%~dp0backend" cmd /k "call "%~dp0venv\Scripts\activate" && uvicorn main:app --reload --host 0.0.0.0" ^
";" split-pane -d "%~dp0frontend" cmd /k "npm run dev -- --host"