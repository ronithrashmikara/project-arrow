"""Make README art with fal: hero image -> short looping video -> assets/hero.gif.

FAL_KEY=... python -I tools/make_assets.py   (key from the environment, never stored)
"""
import os, sys, time, subprocess
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "assets"; A.mkdir(exist_ok=True)
H = {"Authorization": f"Key {os.environ['FAL_KEY']}", "Content-Type": "application/json"}

def fal(model, payload, timeout=600):
    r = requests.post(f"https://queue.fal.run/{model}", headers=H, json=payload, timeout=60)
    r.raise_for_status(); job = r.json()
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = requests.get(job["status_url"], headers=H, timeout=30).json()
        if s.get("status") == "COMPLETED":
            return requests.get(job["response_url"], headers=H, timeout=30).json()
        time.sleep(4)
    sys.exit(f"{model} timed out")

def save(url, path):
    path.write_bytes(requests.get(url, timeout=120).content); print("saved", path)

HERO = ("Wide cinematic illustration, a calm Sri Lankan tropical boutique hotel with palm trees and green hills at golden "
        "hour, soft translucent data visualisation overlays floating in the sky: line charts, leaf icons, small CO2 "
        "molecule shapes and glowing arrows pointing downward, emerald green and deep teal palette with warm sunset light, "
        "clean modern flat-3D style, lots of empty sky on the left for a title, no text, no letters, no logos")
VIDEO = ("Slow gentle cinematic camera push-in, palm leaves sway softly in the breeze, the floating chart lines and leaf "
         "icons drift and glow gently, light shimmers, smooth seamless motion, no text")

if not (A / "hero.png").exists():
    res = fal("fal-ai/flux-pro/v1.1-ultra", {"prompt": HERO, "aspect_ratio": "16:9", "output_format": "png"})
    save(res["images"][0]["url"], A / "hero.png")
if not (A / "hero.mp4").exists():
    up = requests.post("https://queue.fal.run/fal-ai/kling-video/v2.1/standard/image-to-video", headers=H, timeout=60,
                       json={"prompt": VIDEO, "image_url": "data:image/png;base64," + __import__("base64").b64encode((A / "hero.png").read_bytes()).decode(),
                             "duration": "5"})
    up.raise_for_status(); job = up.json()
    while True:
        s = requests.get(job["status_url"], headers=H, timeout=30).json()
        if s.get("status") == "COMPLETED":
            break
        time.sleep(6)
    res = requests.get(job["response_url"], headers=H, timeout=30).json()
    save(res["video"]["url"], A / "hero.mp4")

# wide banner GIF: crop to 3:1 strip, ping-pong loop so it never jumps
# title_overlay.png (900x300, transparent) is drawn on top
vf = ("[0:v]fps=10,scale=900:-1:flags=lanczos,crop=900:300:0:(ih-300)/2,"
      "split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v];[v][1:v]overlay=0:0,"
      "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(A / "hero.mp4"), "-i", str(A / "title_overlay.png"),
                "-filter_complex", vf, str(A / "hero.gif")], check=True)
print("gif", (A / "hero.gif").stat().st_size // 1024, "KB")
