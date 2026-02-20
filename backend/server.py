from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from solver import evaluate, optimize

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = json.loads(self.rfile.read(length) or b"{}")

        if self.path == "/api/evaluate":
            return self._send_json(200, evaluate(data))
        if self.path == "/api/solve":
            return self._send_json(200, optimize(data))
        return self._send_json(404, {"error": "Not found"})

    def do_GET(self):
        rel = "index.html" if self.path in ("/", "") else self.path.lstrip("/")
        path = (FRONTEND / rel).resolve()
        if FRONTEND not in path.parents and path != FRONTEND:
            self.send_error(403)
            return
        if not path.exists() or path.is_dir():
            self.send_error(404)
            return

        mime = "text/plain"
        if path.suffix == ".html":
            mime = "text/html"
        elif path.suffix == ".css":
            mime = "text/css"
        elif path.suffix in (".js", ".jsx"):
            mime = "application/javascript"

        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print("Serving Party Planner at http://0.0.0.0:8000")
    server.serve_forever()
