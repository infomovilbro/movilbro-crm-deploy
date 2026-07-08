#!/bin/bash
# deploy.sh - Un solo comando para actualizar y reiniciar en Replit
# Uso: bash deploy.sh
git fetch --all && git reset --hard origin/main && pkill -9 -f node && sleep 2 && node server.js