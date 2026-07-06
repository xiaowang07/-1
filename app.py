"""上海市学校使用数据看板 Web 服务入口。"""

import os
from pathlib import Path

from flask import Flask, send_from_directory

ROOT = Path(__file__).parent
STATIC = ROOT / "static"

app = Flask(__name__, static_folder=str(STATIC), static_url_path="")


@app.route("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.route("/data/<path:filename>")
def data_files(filename):
    return send_from_directory(STATIC / "data", filename)


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC, filename)


def ensure_data():
    data_file = STATIC / "data" / "dashboard.json"
    if not data_file.exists():
        from prepare_data import main as build_data

        build_data()


if __name__ == "__main__":
    ensure_data()
    port = int(os.environ.get("PORT", 8501))
    app.run(host="0.0.0.0", port=port, debug=False)
