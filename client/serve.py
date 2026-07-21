#!/usr/bin/env python3
"""Tiny static server for the PERILUNE structured client.

The client is a set of plain ES modules — no build step — so any static server works. This
one adds no-store headers (so edits show on reload, matching the host's dev ergonomics) and
the correct MIME type for .js modules. It does NOT proxy the sim: the client opens a WebSocket
straight to the host (default ws://localhost:8330/ws — see src/wire/session.js). Run the host
separately:

    ~/.dotnet/dotnet run --project hosts/web -- --port 8330
    python3 client/serve.py           # serves client/ at http://localhost:8331/

Override the client port with:  python3 client/serve.py 9000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CLIENT_DIR = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter console
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8331
    handler = partial(Handler, directory=str(CLIENT_DIR))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"PERILUNE client: http://localhost:{port}/  (serving {CLIENT_DIR})")
        print("  host must be running: ~/.dotnet/dotnet run --project hosts/web -- --port 8330")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
