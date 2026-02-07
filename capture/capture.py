"""
Chalkboard Capture Script

Captures frames from an IP camera MJPEG stream and sends them to the backend
for chalkboard-to-notes processing.

All settings are in config.json (same directory as this script).

Usage:
    python capture.py
"""

import io
import json
import os
import sys
import time
from datetime import datetime

import requests
from PIL import Image

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    if not os.path.isfile(CONFIG_PATH):
        print(f"Config file not found: {CONFIG_PATH}")
        print("Create config.json with camera_url, backend_url, capture_interval_seconds")
        sys.exit(1)

    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    required = ["camera_url", "backend_url", "capture_interval_seconds"]
    for key in required:
        if key not in config:
            print(f"Missing required config key: {key}")
            sys.exit(1)

    return config


def grab_frame_mjpeg(stream, num_frames=10):
    """Read multiple JPEG frames from an MJPEG stream, return the last complete one.

    The first frame is often partial/blurry. Reading several frames and keeping
    the last gives a much sharper result (matches what a browser displays).
    """
    buf = b""
    last_frame = None
    frames_read = 0

    while frames_read < num_frames:
        chunk = stream.read(4096)
        if not chunk:
            break
        buf += chunk

        while True:
            start = buf.find(b"\xff\xd8")
            if start == -1:
                buf = b""
                break
            end = buf.find(b"\xff\xd9", start + 2)
            if end == -1:
                # Keep from start marker onward, discard earlier bytes
                buf = buf[start:]
                break
            # Complete frame found
            last_frame = buf[start : end + 2]
            frames_read += 1
            buf = buf[end + 2:]
            if frames_read >= num_frames:
                break

    return last_frame


def grab_snapshot(camera_url, auth=None):
    """Grab a single frame - tries MJPEG stream and reads one frame."""
    try:
        resp = requests.get(camera_url, stream=True, timeout=10, auth=auth)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")

        if "multipart" in content_type:
            frame = grab_frame_mjpeg(resp.raw)
            resp.close()
            return frame
        elif "image" in content_type:
            data = resp.content
            resp.close()
            return data
        else:
            frame = grab_frame_mjpeg(resp.raw)
            resp.close()
            return frame
    except requests.RequestException as e:
        print(f"Camera error: {e}")
        return None


def rotate_image(jpeg_bytes):
    """Rotate image 90 degrees clockwise."""
    img = Image.open(io.BytesIO(jpeg_bytes))
    rotated = img.rotate(-90, expand=True)
    buf = io.BytesIO()
    rotated.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def send_frame(backend_url, jpeg_bytes):
    url = f"{backend_url.rstrip('/')}/upload-image"
    try:
        files = {"file": ("frame.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")}
        resp = requests.post(url, files=files, timeout=60)
        print(f"[{resp.status_code}] {resp.text[:200]}")
        return resp
    except requests.ConnectionError:
        print(f"Connection error: could not reach {url}")
    except requests.Timeout:
        print(f"Request timed out: {url}")
    except requests.RequestException as e:
        print(f"Request failed: {e}")
    return None


def main():
    config = load_config()

    camera_url = config["camera_url"]
    backend_url = config["backend_url"]
    interval = config["capture_interval_seconds"]
    username = config.get("camera_username")
    password = config.get("camera_password")
    auth = (username, password) if username else None
    print(f"Camera URL:  {camera_url}")
    print(f"Backend URL: {backend_url}")
    print(f"Interval:    {interval}s")
    print(f"Auth:        {'yes' if auth else 'none'}")
    print()

    # Quick connectivity test
    print("Testing camera connection...")
    test = grab_snapshot(camera_url, auth=auth)
    if test:
        print(f"Camera OK - got frame ({len(test)} bytes)")
    else:
        print("WARNING: Could not grab test frame. Will keep retrying...")

    # Save captures locally for review
    captures_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")
    os.makedirs(captures_dir, exist_ok=True)
    print(f"Saving captures to: {captures_dir}")

    print("Press Ctrl+C to stop.\n")

    try:
        while True:
            jpeg = grab_snapshot(camera_url, auth=auth)
            if jpeg is None:
                print("No frame captured, retrying in 3s...")
                time.sleep(3)
                continue

            # Rotate 90 degrees clockwise
            jpeg = rotate_image(jpeg)

            # Save frame locally
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = os.path.join(captures_dir, f"frame_{timestamp}.jpg")
            with open(filepath, "wb") as f:
                f.write(jpeg)
            print(f"Saved: {filepath}")

            print(f"Captured frame ({len(jpeg)} bytes), sending to backend...")
            send_frame(backend_url, jpeg)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nStopping capture.")
    print("Done.")


if __name__ == "__main__":
    main()
