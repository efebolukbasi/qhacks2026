import os
import json
import re
import base64
import logging

import requests

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")
IMAGE_GEN_MODEL = "google/gemini-3-pro-image-preview"

PROMPT = r"""You are converting a photograph of a chalkboard/whiteboard into clean, well-typeset lecture notes that read like a continuous document (similar to LaTeX lecture notes).

RULES:
1. Extract ONLY what is clearly written on the board. Do NOT hallucinate or add content.
2. If handwriting is unclear, omit it entirely.
3. ALL math must be wrapped in LaTeX delimiters:
   - Inline math: $...$  (e.g. $x^2 + y^2 = r^2$)
   - Display math: $$...$$ (e.g. $$\int_0^1 f(x)\,dx$$)
   - NEVER write math as plain text. Even simple variables like x, y, z should be $x$, $y$, $z$ when used mathematically.
   - NEVER duplicate content as both LaTeX and plain text.
4. Write the content as flowing prose with embedded math, like you would in a LaTeX document. Use complete sentences where appropriate. Sections should read naturally one after the other as a continuous document.
5. Group related content together as it appears on the board. One block of work = one section.
6. Use newlines (\n) to separate paragraphs within a section. Keep the writing clean and readable.
7. For DIAGRAMS/FIGURES on the board:
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
    "content": "Plane Equations\n\nConsider a point on the plane $(a, b, c)$ and an arbitrary point $P = (x, y, z)$.\n\nThe normal vector $\\vec{n}$ is perpendicular to the plane. We can express the equation of the plane as:\n\n$$\\vec{n} \\cdot (P - P_0) = 0$$"
  },
  {
    "section_id": "diag-1",
    "type": "diagram",
    "content": "A 2D coordinate system with x-axis (horizontal) and y-axis (vertical). A point labeled P₀ is marked at the center of a shaded plane. From P₀, a bold arrow points upward and to the right, labeled 'n' (the normal vector). The plane is shown as a tilted rectangle passing through P₀, perpendicular to the normal vector.",
    "caption": "Plane with normal vector"
  }
]"""


# Known LaTeX commands that start with characters that double as JSON escapes
# (b → \b backspace, f → \f formfeed, n → \n newline, r → \r return, t → \t tab)
_LATEX_CMDS_BY_FIRST = {
    'b': ['bar', 'beta', 'bf', 'big', 'bigg', 'binom', 'boldsymbol', 'bot', 'bullet', 'boxed'],
    'f': ['frac', 'forall', 'flat', 'flalign'],
    'n': ['nabla', 'neg', 'neq', 'newcommand', 'newline', 'not', 'notin', 'nu', 'nolimits'],
    'r': ['rangle', 'rceil', 'Re', 'rfloor', 'rho', 'right', 'rightarrow', 'Rightarrow'],
    't': ['tau', 'text', 'textbf', 'textit', 'textrm', 'theta', 'tilde', 'times', 'to', 'top', 'triangle'],
}


def _is_latex_command(text: str, pos: int) -> bool:
    """Check if text[pos:] starts with a known LaTeX command name.

    `pos` should point to the first character AFTER the backslash.
    Returns True only if a full command word matches (next char is non-alpha or end-of-string).
    """
    if pos >= len(text):
        return False
    candidates = _LATEX_CMDS_BY_FIRST.get(text[pos])
    if not candidates:
        return False
    for cmd in candidates:
        end = pos + len(cmd)
        if text[pos:end] == cmd and (end >= len(text) or not text[end].isalpha()):
            return True
    return False


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
                # Ambiguous: could be a JSON escape (\n, \t, …) or a LaTeX
                # command (\frac, \nu, \theta, …).  Check whether the text
                # starting at next_ch matches a *known* LaTeX command word.
                if _is_latex_command(text, i + 1):
                    result.append('\\\\')   # LaTeX – escape the backslash
                    i += 1
                else:
                    result.append('\\')     # JSON escape – keep as-is
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


def generate_diagram_image(chalkboard_image_path: str) -> tuple[bytes, str] | None:
    """Enhance a diagram from the chalkboard image using OpenRouter's Nano Banana.
    
    Returns:
        (image_bytes, extension) tuple, or None on failure.
    """
    logger.info("Enhancing diagram from chalkboard image...")
    
    with open(chalkboard_image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    
    ext = chalkboard_image_path.lower().rsplit(".", 1)[-1] if "." in chalkboard_image_path else "jpeg"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "image/jpeg")
    
    enhanced_prompt = """Please clean up and enhance this diagram from a chalkboard photo:

- Enhance clarity and readability
- Clean up the background (make it white/clean)
- Improve line quality and contrast
- Keep all labels, text, and mathematical notation visible and clear
- Maintain the original structure and layout, as well as keep all the relative positions of the elements
- Make it look professional, like a textbook diagram
- Ensure high contrast for visibility"""
    
    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/qhacks",
                "X-Title": "QHacks Chalkboard Notes",
            },
            json={
                "model": IMAGE_GEN_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": enhanced_prompt},
                            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_data}"}},
                        ],
                    }
                ],
                "modalities": ["image", "text"],
                "image_config": {"aspect_ratio": "16:9", "image_size": "2K"},
                "temperature": 0.7,
            },
            timeout=180,
        )
        resp.raise_for_status()
        
        message = resp.json()["choices"][0]["message"]
        logger.info(f"Image gen response keys: {message.keys()}")
        
        if "images" not in message or not message["images"]:
            logger.error(f"No images in response. Content: {message.get('content', '')[:300]}")
            return None
        
        data_url = message["images"][0]["image_url"]["url"]
        if not data_url.startswith("data:image/"):
            logger.error(f"Unexpected image URL format: {data_url[:100]}")
            return None
        
        match = re.search(r'data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)', data_url)
        if not match:
            logger.error(f"Could not parse data URL: {data_url[:100]}")
            return None
        
        img_ext = match.group(1)
        img_bytes = base64.b64decode(match.group(2))
        logger.info(f"Decoded diagram image ({len(img_bytes)} bytes, {img_ext})")
        return img_bytes, img_ext
        
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed for image generation: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to generate diagram image: {e}", exc_info=True)
        return None


def _build_prompt(existing_sections: list[dict] | None = None) -> str:
    """Build the full prompt, injecting existing section summaries when available.

    Args:
        existing_sections: List of dicts with keys section_id, type, and
            content_preview.  When None or empty the base prompt is returned.
    """
    if not existing_sections:
        return PROMPT

    # Find the highest block/diag numbers so the AI knows where to continue
    max_block = 0
    max_diag = 0
    for sec in existing_sections:
        sid = sec["section_id"]
        if sid.startswith("block-"):
            try:
                max_block = max(max_block, int(sid.split("-", 1)[1]))
            except ValueError:
                pass
        elif sid.startswith("diag-"):
            try:
                max_diag = max(max_diag, int(sid.split("-", 1)[1]))
            except ValueError:
                pass

    # Build a readable summary of each existing section so the AI can
    # decide whether the current board content matches one of them.
    section_lines = []
    for sec in existing_sections:
        preview = sec.get("content_preview", "")
        section_lines.append(
            f'  - {sec["section_id"]} (type={sec["type"]}): "{preview}"'
        )
    sections_block = "\n".join(section_lines)

    context = (
        f"\n\nIMPORTANT — EXISTING NOTES CONTEXT:\n"
        f"The following sections already exist for this lecture:\n{sections_block}\n\n"
        f"- If the board still shows the SAME content as an existing section, you MUST reuse that section_id so it updates in place.\n"
        f"- Only create a NEW section_id for content that is genuinely new and not covered by any existing section.\n"
        f"- For new content, continue numbering from "
        f"block-{max_block + 1} / diag-{max_diag + 1}.\n"
        f"- Do NOT restart numbering from block-1."
    )
    return PROMPT + context


def send_image_to_gemini(
    image_path: str,
    generate_diagrams: bool = True,
    existing_sections: list[dict] | None = None,
) -> list[dict]:
    """Process chalkboard image and optionally generate images for diagrams.

    When generate_diagrams is True, diagram sections will have their image bytes
    attached as '_image_bytes' and '_image_ext' keys (to be uploaded by the caller).

    Args:
        image_path: Path to the chalkboard image.
        generate_diagrams: Whether to generate enhanced diagram images.
        existing_sections: Section summaries already stored for this room
            (each dict has section_id, type, content_preview), used to avoid
            duplicating notes across captures.

    Returns:
        List of section dictionaries with content
    """
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    ext = image_path.lower().rsplit(".", 1)[-1] if "." in image_path else "jpeg"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "image/jpeg")

    existing_ids = [s["section_id"] for s in existing_sections] if existing_sections else []
    prompt = _build_prompt(existing_sections)
    logger.info(f"Sending image to OpenRouter model={OPENROUTER_MODEL}, mime={mime}, base64_len={len(image_data)}, existing_ids={existing_ids}")

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
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_data}"}},
                    ],
                }
            ],
        },
        timeout=90,
    )

    if not resp.ok:
        logger.error(f"OpenRouter responded {resp.status_code}: {resp.text[:1000]}")
    resp.raise_for_status()

    text = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code block wrappers if present
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()

    text = fix_latex_json(text)
    logger.info(f"AI response (fixed): {text[:500]}")
    sections = json.loads(text)
    
    # Generate actual images for NEW diagram sections only.
    # Reused sections that already have an image are skipped.
    sections_with_images = {
        s["section_id"]
        for s in (existing_sections or [])
        if s.get("image_url")
    }

    if generate_diagrams:
        for section in sections:
            sid = section.get("section_id")
            if section.get("type") == "diagram" and sid not in sections_with_images:
                result = generate_diagram_image(image_path)
                if result:
                    img_bytes, img_ext = result
                    # Attach raw bytes so the caller can upload to storage
                    section["_image_bytes"] = img_bytes
                    section["_image_ext"] = img_ext
                    logger.info(f"Generated diagram for section {sid}")
            elif sid in sections_with_images:
                logger.info(f"Skipping image generation for reused section {sid}")
    
    return sections
