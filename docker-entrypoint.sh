#!/bin/sh
# Starts a virtual X display so Chrome can run headful (non-headless) inside
# the container — the automation relies on headful Chrome to avoid ChatGPT's
# headless-bot detection (see puppeteerService.js). Skipped automatically if
# PUPPETEER_HEADLESS=true, since there's nothing for Xvfb to render to.
set -e

if [ "$PUPPETEER_HEADLESS" != "true" ]; then
  WIDTH="${PUPPETEER_WINDOW_WIDTH:-1920}"
  HEIGHT="${PUPPETEER_WINDOW_HEIGHT:-540}"

  echo "▶️  Starting Xvfb on :99 (${WIDTH}x${HEIGHT})…"
  Xvfb :99 -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp &
  XVFB_PID=$!

  # Give Xvfb a moment to bind before Chrome tries to attach to it.
  for i in $(seq 1 20); do
    if [ -e /tmp/.X11-unix/X99 ]; then break; fi
    sleep 0.25
  done

  export DISPLAY=:99

  # Forward termination signals to both Xvfb and the app so `docker stop`
  # shuts the container down promptly instead of waiting out the grace period.
  trap 'kill "$XVFB_PID" 2>/dev/null; kill "$APP_PID" 2>/dev/null' TERM INT
fi

"$@" &
APP_PID=$!
wait "$APP_PID"
