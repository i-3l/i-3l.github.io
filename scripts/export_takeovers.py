"""Export the takeover-timeline clips and data from the I3L LeRobot datasets on Hugging Face.

For one Round 1 collection episode per task this writes
  static/videos/takeovers/<key>.mp4   head camera (2x) beside the stacked wrist cameras, H.264
  static/videos/takeovers/<key>.jpg   poster frame
  static/videos/takeovers/<key>.joints.bin   Int16 joint track for the 3D robot view (see JOINT_COLUMNS)
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

# Joint tracks: one Int16 row per frame, values multiplied by JOINT_SCALE (radians, or metres of finger travel).
# Columns: torso 1-4, left arm 1-7, right arm 1-7, left finger travel, right finger travel (0.05 m = open).
JOINT_COLUMNS = 20
JOINT_SCALE = 5000


def joint_track(parquet, sim):
    state = np.stack(pd.read_parquet(parquet, columns=["observation.state"])["observation.state"].to_numpy())
    if sim:
        # OmniGibson proprio: 6 virtual base joints, 4 torso, arm joints interleaved left/right, then the
        # finger joints grouped per gripper (left pair, right pair), all in metres.
        parts = [state[:, 6:10], state[:, 10:24:2], state[:, 11:24:2], state[:, 24:25], state[:, 26:27]]
    else:
        # Real robot (IIIL action order): base 3, torso 4, left arm 7, left gripper, right arm 7, right gripper.
        # Grippers are in [-1 (open), 1 (closed)]; convert to finger travel.
        travel = lambda g: 0.05 * (1 - g) / 2
        parts = [state[:, 3:7], state[:, 7:14], state[:, 15:22], travel(state[:, 14:15]), travel(state[:, 22:23])]
    track = np.concatenate(parts, axis=1)
    assert track.shape[1] == JOINT_COLUMNS
    return np.round(track * JOINT_SCALE).astype("<i2")

# Subtask names follow the stage labels in Fig. 5 of the paper. Each subtask ends where the next begins.
# Books and popcorn starts are the human annotations made with IIIL/scripts/data/annotate_subtask.py
# (2026_arxiv_IIIL_paper/results/Data/Annotation/wensi-ai/<dataset>/subtask_annotations.json); the bread starts
# refine that episode's annotations against the camera streams. Radio and the sim task have no human
# annotations for these episodes; their starts were chosen from the camera streams.
TASKS = [
    {
        "key": "books", "short": "Books", "dataset": "books", "episode": 5,
        "title": "Boxing Books up for Storage", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Pick basket"), (433, "Place basket"), (712, "Pick book 1"),
                     (1047, "Pick book 2"), (1504, "Place books")],
    },
    {
        "key": "bread", "short": "Breakfast Bowls", "dataset": "bread", "episode": 10,
        "title": "Prepare Make-Ahead Breakfast Bowls", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Open drawer"), (445, "Pick bowl"), (800, "Close drawer"), (1110, "Put bread 1"),
                     (1460, "Put bread 2"), (1770, "Place bowl")],
    },
    {
        "key": "popcorn", "short": "Popcorn", "dataset": "popcorn", "episode": 17,
        "title": "Make Microwave Popcorn", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Pick popcorn"), (420, "Open microwave"), (776, "Place popcorn"),
                     (996, "Close microwave")],
    },
    {
        "key": "radio", "short": "Radio", "dataset": "radio", "episode": 18,
        "title": "Turning on Radio", "setting": "R1 Pro · real world",
        "subtasks": [(0, "Navigate to radio"), (330, "Pick radio"), (560, "Press button")],
    },
    {
        "key": "fridge_radio", "short": "Fridge + Radio (sim)", "dataset": "or", "episode": 7,
        "title": "Open Fridge and Pick Up Radio", "setting": "R1 Pro · BEHAVIOR simulation",
        "subtasks": [(0, "Open fridge"), (255, "Navigate"), (405, "Pick radio")],
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
        track = joint_track(local / f"data/chunk-000/episode_{episode:06d}.parquet", sim="simulation" in task["setting"])
        (VIDEO_DIR / f"{task['key']}.joints.bin").write_bytes(track.tobytes())
        exported.append({
            "key": task["key"], "short": task["short"], "title": task["title"], "setting": task["setting"],
            "source": f"I3L/{dataset}-base-int-1-25", "episode": episode,
            "fps": fps, "frames": frames,
            "video": f"./static/videos/takeovers/{task['key']}.mp4",
            "poster": f"./static/videos/takeovers/{task['key']}.jpg",
            "joints": {"file": f"./static/videos/takeovers/{task['key']}.joints.bin",
                       "columns": JOINT_COLUMNS, "scale": JOINT_SCALE},
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
