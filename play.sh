#!/bin/sh
# Every Soul Aboard — the one command that starts the game.
#
#   ./play.sh                                    # then open the URL it prints
#   ./play.sh --host-port 8390 --client-port 8391
#   ./play.sh --no-open                          # don't launch a browser
#
# There is ONE game and it needs no options: the sim host serves `--ship grid` (its default),
# this script also starts the client's static server, waits until both are really answering,
# and prints a single URL. Ctrl+C stops both.
#
# `--ship slice` and `--ship perilune` are TEST FIXTURES, not games — run those against
# hosts/scenario or hosts/web directly; play.sh does not offer them.
set -eu
DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
command -v "$DOTNET" >/dev/null 2>&1 || DOTNET=dotnet
cd "$(dirname "$0")"

HOST_PORT="${PERILUNE_HOST_PORT:-8330}"
CLIENT_PORT="${PERILUNE_CLIENT_PORT:-8331}"
OPEN_BROWSER=1

need_port() {  # $1 flag, $2 value — a missing or non-numeric port is a typo, not a port
  case "${2:-}" in
    ''|*[!0-9]*) echo "play.sh: $1 needs a port number" >&2; exit 2 ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host-port)   need_port "$1" "${2:-}"; HOST_PORT="$2"; shift 2 ;;
    --client-port) need_port "$1" "${2:-}"; CLIENT_PORT="$2"; shift 2 ;;
    --no-open)     OPEN_BROWSER=0; shift ;;
    # The header comment IS the help text (everything up to the first line of code).
    -h|--help)     awk 'NR > 1 { if (!/^#/) exit; print substr($0, 3) }' "$0"; exit 0 ;;
    *) echo "play.sh: unknown option '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[ "$HOST_PORT" != "$CLIENT_PORT" ] || {
  echo "play.sh: the host and the client need different ports (both are $HOST_PORT)" >&2; exit 2; }

command -v python3 >/dev/null 2>&1 || { echo "play.sh: python3 not found — it serves client/" >&2; exit 1; }
command -v "$DOTNET" >/dev/null 2>&1 || { echo "play.sh: no dotnet (looked for \$HOME/.dotnet/dotnet and PATH)" >&2; exit 1; }

# --- port hygiene -------------------------------------------------------------------------
# A stale host from a previous session is the failure the owner actually hits. Name it rather
# than dying inside HttpListener with an ObjectDisposedException.
port_owner() {  # -> "PeriluneWeb (pid 1234)" | "" | "an unnameable process (lsof not installed)"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 { print $1 " (pid " $2 ")"; exit }'
  elif ! python3 -c 'import socket,sys
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try: s.bind(("127.0.0.1", int(sys.argv[1])))
except OSError: sys.exit(1)
s.close()' "$1" 2>/dev/null; then
    echo "an unnameable process (install lsof to see which)"
  fi
}

require_free() {  # $1 port, $2 what it is for
  owner="$(port_owner "$1")"
  if [ -n "$owner" ]; then
    echo "play.sh: port $1 (the $2) is already in use by $owner." >&2
    echo "         Either stop it, or run on other ports:" >&2
    echo "         ./play.sh --host-port $((HOST_PORT + 60)) --client-port $((CLIENT_PORT + 60))" >&2
    exit 1
  fi
}

require_free "$HOST_PORT" "sim host"
require_free "$CLIENT_PORT" "client server"

# --- start both halves --------------------------------------------------------------------
LOGDIR="${TMPDIR:-/tmp}/perilune-play-$$"
mkdir -p "$LOGDIR"
HOST_PID=""
CLIENT_PID=""

any_alive() {
  for pid in $CLIENT_PID $HOST_PID; do
    if kill -0 "$pid" 2>/dev/null; then return 0; fi
  done
  return 1
}

settle() {  # give the children $1 tenths of a second to go on their own
  n=0
  while [ "$n" -lt "$1" ] && any_alive; do sleep 0.1; n=$((n + 1)); done
}

# Escalate: SIGINT (both halves handle it themselves and exit 0 — PeriluneWeb's CancelKeyPress,
# serve.py's KeyboardInterrupt), then SIGTERM, then SIGKILL. Nothing survives this function; an
# orphaned host squatting on 8330 is the mess play.sh exists to prevent.
stop_all() {
  rc=$?                                # 130 from an interrupted sleep on Ctrl+C; 1 from a failed await
  trap - INT TERM EXIT
  echo ""
  echo "play.sh: stopping…"
  for pid in $CLIENT_PID $HOST_PID; do kill -INT  "$pid" 2>/dev/null || true; done; settle 60
  for pid in $CLIENT_PID $HOST_PID; do kill -TERM "$pid" 2>/dev/null || true; done; settle 20
  for pid in $CLIENT_PID $HOST_PID; do kill -KILL "$pid" 2>/dev/null || true; done; settle 20
  echo "play.sh: stopped. (logs: $LOGDIR)"
  exit "$rc"
}
trap stop_all INT TERM EXIT

serving() {  # true once an HTTP GET on $1 gets any answer at all
  python3 -c 'import sys, urllib.request, urllib.error
try:
    urllib.request.urlopen("http://127.0.0.1:" + sys.argv[1] + "/", timeout=1).read(1)
except urllib.error.HTTPError:
    pass          # a status line is still proof something is serving
except Exception:
    sys.exit(1)' "$1" 2>/dev/null
}

await() {  # $1 port, $2 pid, $3 label, $4 logfile
  n=0
  while [ "$n" -lt 300 ]; do           # 60s: a cold dotnet start is slow, a warm one ~1s
    if ! kill -0 "$2" 2>/dev/null; then
      echo "play.sh: the $3 exited during startup. Its output:" >&2
      tail -20 "$4" >&2
      exit 1
    fi
    if serving "$1"; then return 0; fi
    sleep 0.2
    n=$((n + 1))
  done
  echo "play.sh: the $3 never answered on port $1 (60s). Its output:" >&2
  tail -20 "$4" >&2
  exit 1
}

echo "play.sh: building the sim host…"
"$DOTNET" build hosts/web/PeriluneWeb.csproj --nologo -v q > "$LOGDIR/build.log" 2>&1 \
  || { echo "play.sh: build failed:" >&2; tail -30 "$LOGDIR/build.log" >&2; exit 1; }

WEB_DLL=hosts/web/bin/Debug/net8.0/PeriluneWeb.dll
[ -f "$WEB_DLL" ] || { echo "play.sh: built, but no assembly at $WEB_DLL" >&2; exit 1; }

# `dotnet <dll>`, not `dotnet run`: `dotnet run` forks a child we would then orphan on Ctrl+C,
# and orphaned hosts holding 8330 are exactly the mess this script exists to prevent. (Not the
# apphost `bin/.../PeriluneWeb` either — with the SDK at ~/.dotnet and nothing on PATH it can't
# find libhostfxr and dies with "You must install .NET".)
"$DOTNET" "$WEB_DLL" --port "$HOST_PORT" > "$LOGDIR/host.log" 2>&1 &
HOST_PID=$!
python3 client/serve.py "$CLIENT_PORT" > "$LOGDIR/client.log" 2>&1 &
CLIENT_PID=$!

await "$HOST_PORT" "$HOST_PID" "sim host" "$LOGDIR/host.log"
await "$CLIENT_PORT" "$CLIENT_PID" "client server" "$LOGDIR/client.log"

URL="http://localhost:$CLIENT_PORT/?port=$HOST_PORT"
echo ""
echo "  EVERY SOUL ABOARD — $URL"
echo ""
grep -m1 'dialogue backend:' "$LOGDIR/host.log" 2>/dev/null | sed 's/^ */  /' || true
echo "  logs: $LOGDIR   ·   Ctrl+C to stop both"
echo ""

if [ "$OPEN_BROWSER" -eq 1 ] && command -v open >/dev/null 2>&1; then open "$URL" || true; fi

# Block until Ctrl+C, or until either half dies on its own (a dead host is not a running game).
while kill -0 "$HOST_PID" 2>/dev/null && kill -0 "$CLIENT_PID" 2>/dev/null; do sleep 1; done
echo "play.sh: a half exited on its own — see $LOGDIR" >&2
exit 1
