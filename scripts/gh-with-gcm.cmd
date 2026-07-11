@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0gh-with-gcm.ps1" %*
