from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import json
import time


ROOT = Path(__file__).parent
LEADERBOARD_FILE = ROOT / "leaderboard.json"

SEED_LEADERS = []
FAKE_LEADER_NAMES = {"Nova", "BeatSmith", "Mika", "TempoKid", "Echo"}


def clean_name(value):
    name = " ".join(str(value or "Player").strip().split())
    return name[:18] or "Player"


def clean_score(value):
    try:
        score = float(value)
    except (TypeError, ValueError):
        score = 0.0
    return round(max(0.0, min(10.0, score)), 3)


def load_scores():
    if not LEADERBOARD_FILE.exists():
        return list(SEED_LEADERS)
    try:
        data = json.loads(LEADERBOARD_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return list(SEED_LEADERS)
    rows = data if isinstance(data, list) else []
    return [row for row in rows if row.get("name") not in FAKE_LEADER_NAMES]


def save_scores(rows):
    LEADERBOARD_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def ranked(rows):
    return sorted(rows, key=lambda row: (-clean_score(row.get("average")), str(row.get("createdAt", ""))))[:100]


class PulseTrialHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/leaderboard":
            rows = ranked(load_scores())
            self.send_json({"leaderboard": rows[:10], "total": len(rows)})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/leaderboard":
            self.send_error(404)
            return

        payload = self.read_json()
        average = clean_score(payload.get("average"))
        rounds = payload.get("rounds") if isinstance(payload.get("rounds"), list) else []
        row = {
            "name": clean_name(payload.get("name")),
            "average": average,
            "rounds": [clean_score(score) for score in rounds[:5]],
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        rows = ranked(load_scores() + [row])
        save_scores(rows)
        rank = next(
            index + 1
            for index, item in enumerate(rows)
            if item.get("createdAt") == row["createdAt"]
            and item.get("name") == row["name"]
            and item.get("average") == row["average"]
        )
        self.send_json({"rank": rank, "total": len(rows), "leaderboard": rows[:10]})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 4174), PulseTrialHandler)
    print("Rhythm Game server running at http://127.0.0.1:4174")
    server.serve_forever()
