import os
import json
import re
import base64

import requests

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")

PROMPT = """You are an AI assistant helping convert a classroom chalkboard into structured lecture notes.

The input is an image of a chalkboard taken during a lecture.

Instructions:
- Extract ONLY clearly visible and legible content.
- Ignore erased, crossed-out, or partially blocked text.
- Focus on:
  - Definitions
  - Equations
  - Step-by-step derivations
  - Key bullet points
- Do NOT hallucinate missing content.
- If handwriting is unclear, omit it.

Output format:
Return a JSON array of note sections.

Each section should have:
- section_id: a short stable identifier (e.g. "def-1", "eq-2", "step-3")
- type: one of ["definition", "equation", "step", "note"]
- content: clean, readable text

Example output:
[
  {
    "section_id": "def-1",
    "type": "definition",
    "content": "Eigenvalue: A scalar λ such that Ax = λx"
  },
  {
    "section_id": "eq-1",
    "type": "equation",
    "content": "Ax = λx"
  }
]"""


def send_image_to_gemini(image_path: str) -> list[dict]:
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    # Detect mime type
    ext = image_path.lower().rsplit(".", 1)[-1] if "." in image_path else "jpeg"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "image/jpeg")

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENROUTER_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{image_data}"
                            },
                        },
                    ],
                }
            ],
        },
        timeout=60,
    )
    resp.raise_for_status()

    text = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code block wrappers if present
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()

    sections = json.loads(text)
    return sections
