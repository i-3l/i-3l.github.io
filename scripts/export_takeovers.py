"""Export the takeover-timeline clips and data from the I3L LeRobot datasets on Hugging Face.

For one Round 1 collection episode per task this writes
  static/videos/takeovers/<key>.mp4   head camera (2x) beside the stacked wrist cameras, H.264
  static/videos/takeovers/<key>.jpg   poster frame
and static/js/takeover-data.js with the takeover segments (int_state == 2), the hand-annotated
subtask boundaries below, and per-round takeover statistics over all 25 episodes of each round.

Run: pip install huggingface_hub pandas pyarrow  (ffmpeg must be on PATH)
     python scripts/export_takeovers.py
"""
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = ROOT / "static" / "videos" / "takeovers"
DATA_JS = ROOT / "static" / "js" / "takeover-data.js"
ROUNDS = ["base-int-1", "hg-int-2", "hg-int-3", "hg-int-4"]
CAMERAS = ["head", "left_wrist", "right_wrist"]
TAKEOVER = 2  # int_state: 0 human demo, 1 pre-intervention, 2 takeover, 3 autonomous

# Subtask starts are frame indices chosen by inspecting the head and wrist cameras, snapped to
# gripper open/close and base-motion events in the action stream. Each subtask ends where the next begins.
TASKS = [
    {
        "key": "books", "short": "Books", "dataset": "books", "episode": 5,
        "title": "Boxing Books up for Storage", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Pick up basket"), (240, "Place basket on table"), (720, "Grasp first book"),
                     (960, "Grasp second book"), (1410, "Put books in basket")],
    },
    {
        "key": "bread", "short": "Breakfast Bowls", "dataset": "bread", "episode": 1,
        "title": "Prepare Make-Ahead Breakfast Bowls", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Open drawer"), (460, "Retrieve bowl"), (1000, "Add first bread"),
                     (1360, "Add second bread"), (1600, "Place bowl on right")],
    },
    {
        "key": "popcorn", "short": "Popcorn", "dataset": "popcorn", "episode": 17,
        "title": "Make Microwave Popcorn", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Go to shelf"), (156, "Grasp bag"), (300, "Carry to microwave"),
                     (590, "Open microwave"), (800, "Place bag inside")],
    },
    {
        "key": "radio", "short": "Radio", "dataset": "radio", "episode": 18,
        "title": "Turning on Radio", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Approach table"), (330, "Grasp radio"), (460, "Lift radio"),
                     (560, "Poke orange button")],
    },
    {
        "key": "fridge_radio", "short": "Fridge + Radio (sim)", "dataset": "or", "episode": 7,
        "title": "Open Fridge and Pick Up Radio", "setting": "R1 Pro · BEHAVIOR simulation",
        "subtasks": [(0, "Reach handle"), (60, "Open fridge door"), (255, "Go to table"),
                     (405, "Grasp radio")],
    },
]


def runs(mask):
    edges = np.flatnonzero(np.diff(np.r_[0, mask.astype(np.int8), 0]))
    return [[int(a), int(b)] for a, b in zip(edges[::2], edges[1::2])]


def int_state(parquet):
    column = pd.read_parquet(parquet, columns=["int_state"]).int_state
    return np.array([np.ravel(v)[0] for v in column], dtype=np.uint8)


def round_stats(cache, dataset):
    stats = []
    for rnd in ROUNDS:
        local = snapshot_download(f"I3L/{dataset}-{rnd}-25", repo_type="dataset",
                                  allow_patterns=["data/*", "meta/*"], local_dir=cache / f"{dataset}-{rnd}")
        states = [int_state(p) for p in sorted(Path(local).glob("data/chunk-*/*.parquet"))]
        stats.append({
            "round": len(stats) + 1,
            "episodes": len(states),
            "takeoversPerEpisode": round(float(np.mean([len(runs(s == TAKEOVER)) for s in states])), 2),
            "takeoverFraction": round(float(np.mean([(s == TAKEOVER).mean() for s in states])), 4),
        })
    return stats


def encode(cache, dataset, episode, key, fps):
    local = cache / f"{dataset}-base-int-1"
    snapshot_download(f"I3L/{dataset}-base-int-1-25", repo_type="dataset", local_dir=local,
                      allow_patterns=[f"videos/chunk-000/observation.rgb.{c}/episode_{episode:06d}.mp4" for c in CAMERAS])
    inputs = []
    for cam in CAMERAS:
        inputs += ["-i", str(local / f"videos/chunk-000/observation.rgb.{cam}/episode_{episode:06d}.mp4")]
    layout = ("[0:v]scale=448:448:flags=lanczos[h];[1:v][2:v]vstack=inputs=2[w];"
              "[h][w]hstack=inputs=2,format=yuv420p[v]")
    out = VIDEO_DIR / f"{key}.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", layout, "-map", "[v]",
                    "-r", str(fps), "-c:v", "libx264", "-preset", "slow", "-crf", "26",
                    "-movflags", "+faststart", "-an", str(out)], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "2", "-i", str(out), "-frames:v", "1",
                    "-q:v", "4", str(VIDEO_DIR / f"{key}.jpg")], check=True)


def main():
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    cache = Path(tempfile.gettempdir()) / "i3l_takeover_export"
    exported = []
    for task in TASKS:
        dataset, episode = task["dataset"], task["episode"]
        stats = round_stats(cache, dataset)
        local = cache / f"{dataset}-base-int-1"
        fps = json.loads((local / "meta" / "info.json").read_text())["fps"]
        states = int_state(local / f"data/chunk-000/episode_{episode:06d}.parquet")
        frames = len(states)
        starts = [s for s, _ in task["subtasks"]]
        encode(cache, dataset, episode, task["key"], fps)
        exported.append({
            "key": task["key"], "short": task["short"], "title": task["title"], "setting": task["setting"],
            "source": f"I3L/{dataset}-base-int-1-25", "episode": episode,
            "fps": fps, "frames": frames,
            "video": f"./static/videos/takeovers/{task['key']}.mp4",
            "poster": f"./static/videos/takeovers/{task['key']}.jpg",
            "takeovers": runs(states == TAKEOVER),
            "subtasks": [{"label": label, "start": s, "end": e}
                         for (s, label), e in zip(task["subtasks"], starts[1:] + [frames])],
            "rounds": stats,
        })
        print(f"{task['key']}: {frames} frames, {len(exported[-1]['takeovers'])} takeovers")
    DATA_JS.write_text(
        "// Generated by scripts/export_takeovers.py from the I3L datasets on Hugging Face; do not edit by hand.\n"
        f"window.I3L_TAKEOVERS = {json.dumps(exported, indent=1)};\n")


if __name__ == "__main__":
    main()
