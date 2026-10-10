#!/usr/bin/env bash
# Uploads dist/alpha to any FTP host (cPanel at IDwebhost, hPanel at Hostinger, …) with a 1-step rollback.
#   FTP_SERVER  FTP_USERNAME  FTP_PASSWORD   (required)
#   FTP_DIR        target folder, default public_html/alpha
#   FTP_TLS_VERIFY yes (default) | no  — "no" only if the host's FTP certificate does not match its name
#   ./scripts/deploy-ftp.sh            deploy:   upload to <dir>__next, then <dir> → <dir>__prev, <dir>__next → <dir>
#   ./scripts/deploy-ftp.sh rollback   rollback: swap <dir> and <dir>__prev
set -euo pipefail
: "${FTP_SERVER:?set FTP_SERVER}" "${FTP_USERNAME:?set FTP_USERNAME}" "${FTP_PASSWORD:?set FTP_PASSWORD}"
DIR="${FTP_DIR:-public_html/alpha}"; DIR="${DIR%/}"
VERIFY="${FTP_TLS_VERIFY:-yes}"
export LFTP_PASSWORD="$FTP_PASSWORD"
SETTINGS="set ftp:ssl-allow true; set ssl:verify-certificate $VERIFY; set net:max-retries 3; set net:timeout 30; set ftp:passive-mode true"
OPEN="open --env-password -u \"$FTP_USERNAME\" \"$FTP_SERVER\""

if [ "${1:-}" = "rollback" ]; then
  lftp -c "$SETTINGS; $OPEN; set cmd:fail-exit yes; mv \"$DIR\" \"${DIR}__rolledback\"; mv \"${DIR}__prev\" \"$DIR\"; set cmd:fail-exit no; rm -rf \"${DIR}__prev_old\"; mv \"${DIR}__rolledback\" \"${DIR}__prev\""
  echo "Rolled back: ${DIR}__prev is live again."
  exit 0
fi

[ -f dist/alpha/index.html ] || { echo "Run node scripts/build-deploy.mjs first"; exit 1; }
lftp -c "$SETTINGS; $OPEN
set cmd:fail-exit no
rm -rf \"${DIR}__next\"
set cmd:fail-exit yes
mirror -R --parallel=4 --no-perms dist/alpha \"${DIR}__next\"
set cmd:fail-exit no
rm -rf \"${DIR}__prev\"
mv \"$DIR\" \"${DIR}__prev\"
set cmd:fail-exit yes
mv \"${DIR}__next\" \"$DIR\""
echo "Deployed to $FTP_SERVER:$DIR (previous version kept in ${DIR}__prev)."
