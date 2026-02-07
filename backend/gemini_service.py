import os
import json
import re
import base64
import logging

import requests

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")

PROMPT = r"""You are converting a photograph of a chalkboard/whiteboard into clean, structured lecture notes.

RULES:
1. Extract ONLY what is clearly written on the board. Do NOT hallucinate or add content.
2. If handwriting is unclear, omit it entirely.
3. ALL math must be wrapped in LaTeX delimiters:
   - Inline math: $...$  (e.g. $x^2 + y^2 = r^2$)
   - Display math: $$...$$ (e.g. $$\int_0^1 f(x)\,dx$$)
   - NEVER write math as plain text. Even simple variables like x, y, z should be $x$, $y$, $z$ when used mathematically.
   - NEVER duplicate content as both LaTeX and plain text.
4. Group related content together as it appears on the board. One block of work = one section.
5. For DIAGRAMS/FIGURES on the board:
   - Set type to "diagram"
   - In "content", write a detailed description of the diagram suitable for an image generation model to recreate it. Describe shapes, axes, labels, arrows, positions, and relationships clearly.
   - Add a short "caption" field.

OUTPUT: Return ONLY a JSON array. No markdown, no explanation.

CRITICAL: In JSON strings, every LaTeX backslash must be escaped as \\. Write \\frac not \frac, \\vec not \vec, \\lambda not \lambda.

Each element:
{
  "section_id": "block-1",
  "type": "definition" | "equation" | "step" | "note" | "diagram",
  "content": "text with $inline$ and $$display$$ LaTeX"
}

For diagrams: content is a detailed text description of the diagram. Add a "caption" field.

Example:
[
  {
    "section_id": "block-1",
    "type": "note",
    "content": "Plane Equations\n\nA point on the plane: $(a, b, c)$\nA point $P$: $(x, y, z)$\n\nThe normal vector $\\vec{n}$ is perpendicular to the plane.\n\n$$\\vec{n} \\cdot (P - P_0) = 0$$"
  },
  {
    "section_id": "diag-1",
    "type": "diagram",
    "content": "A 2D coordinate system with x-axis (horizontal) and y-axis (vertical). A point labeled P₀ is marked at the center of a shaded plane. From P₀, a bold arrow points upward and to the right, labeled 'n' (the normal vector). The plane is shown as a tilted rectangle passing through P₀, perpendicular to the normal vector.",
    "caption": "Plane with normal vector"
  }
]"""


def fix_latex_json(text: str) -> str:
    """Fix LaTeX backslashes inside JSON strings that break JSON parsing."""
    result = []
    i = 0
    in_string = False

    while i < len(text):
        ch = text[i]

        if not in_string:
            if ch == '"':
                in_string = True
            result.append(ch)
            i += 1
            continue

        # Inside a JSON string
        if ch == '\\':
            if i + 1 >= len(text):
                result.append('\\\\')
                i += 1
                continue

            next_ch = text[i + 1]

            if next_ch == '\\':
                result.append('\\\\')
                i += 2
            elif next_ch == '"':
                result.append('\\"')
                i += 2
            elif next_ch == '/':
                result.append('\\/')
                i += 2
            elif next_ch == 'u' and i + 5 < len(text) and all(
                c in '0123456789abcdefABCDEF' for c in text[i + 2 : i + 6]
            ):
                result.append(text[i : i + 6])
                i += 6
            elif next_ch in 'bfnrt':
                # Could be JSON escape (\n, \t) or LaTeX (\frac, \nu, \theta, \rho)
                if i + 2 < len(text) and text[i + 2].isalpha():
                    result.append('\\\\')
                    i += 1
                else:
                    result.append('\\')
                    i += 1
            else:
                result.append('\\\\')
                i += 1
        elif ch == '"':
            in_string = False
            result.append(ch)
            i += 1
        else:
            result.append(ch)
            i += 1

    return ''.join(result)


def send_image_to_gemini(image_path: str) -> list[dict]:
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

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
        timeout=90,
    )
    resp.raise_for_status()

    text = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code block wrappers if present
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()

    # Fix LaTeX backslashes that break JSON parsing
    text = fix_latex_json(text)

    logger.info(f"AI response (fixed): {text[:500]}")

    sections = json.loads(text)
    return sections
