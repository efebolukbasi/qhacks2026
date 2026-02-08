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
2. If handwriting is unclear or a person/object is blocking part of the board, omit the blocked content entirely rather than guessing. It is MUCH better to leave content out than to produce incorrect or garbled notes.
3. ALL math must be wrapped in LaTeX delimiters:
   - Inline math: $...$  (e.g. $x^2 + y^2 = r^2$)
   - Display math: $$...$$ (e.g. $$\int_0^1 f(x)\,dx$$)
   - NEVER write math as plain text. Even simple variables like x, y, z should be $x$, $y$, $z$ when used mathematically.
   - NEVER duplicate content as both LaTeX and plain text.
4. Write the content as flowing prose with embedded math, like you would in a LaTeX document. Use complete sentences where appropriate. Sections should read naturally one after the other as a continuous document.
5. Group related content together as it appears on the board. One block of work = one section.
   - CRITICAL: NEVER split a sentence or paragraph across multiple blocks. If text forms a continuous thought (e.g. "The function f(x) = sin(x) is an example of a periodic function. It repeats every 2π."), it MUST be in a SINGLE block, not split into separate blocks.
   - A block should contain COMPLETE sentences/paragraphs. Each block should end with proper punctuation (period, colon, etc.), not trail off mid-sentence.
   - When in doubt, MERGE content into fewer, larger blocks rather than creating many small ones.
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


def generate_diagram_image(
    chalkboard_image_path: str,
    diagram_description: str | None = None,
    all_sections: list[dict] | None = None,
) -> tuple[bytes, str] | None:
    """Enhance a diagram from the chalkboard image using OpenRouter.

    Args:
        chalkboard_image_path: Path to the full chalkboard photo.
        diagram_description: The text description of the diagram to focus on.
        all_sections: All sections extracted from this image (used to tell the
            model which text content to ignore / exclude from the diagram).

    Returns:
        (image_bytes, extension) tuple, or None on failure.
    """
    logger.info("Enhancing diagram from chalkboard image...")
    
    with open(chalkboard_image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    
    ext = chalkboard_image_path.lower().rsplit(".", 1)[-1] if "." in chalkboard_image_path else "jpeg"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "image/jpeg")

    # Build the list of text content to exclude from the generated image
    exclude_block = ""
    if all_sections:
        text_items = []
        for s in all_sections:
            if s.get("type") != "diagram":
                preview = s.get("content", s.get("content_preview", ""))[:200]
                if preview:
                    text_items.append(f"  - {preview}")
        if text_items:
            exclude_block = (
                "\n\nIMPORTANT — TEXT TO EXCLUDE:\n"
                "The following text/equations also appear on the board but are "
                "already captured as typed notes. Do NOT include any of this "
                "text in the generated image. Only render the diagram/figure "
                "itself with its own labels and axes:\n"
                + "\n".join(text_items)
            )

    diagram_block = ""
    if diagram_description:
        diagram_block = (
            f"\n\nDIAGRAM DESCRIPTION:\n{diagram_description}"
        )

    caption_block = ""
    if all_sections:
        for s in all_sections:
            if s.get("type") == "diagram" and s.get("content") == diagram_description:
                cap = s.get("caption", "")
                if cap:
                    caption_block = f"\n\nCAPTION: {cap}"
                break

    enhanced_prompt = f"""Generate a clean, professional diagram from the description below.

A reference photo of a chalkboard is attached for spatial context ONLY. Do NOT copy, enhance, filter, or screenshot the photo. The output must be a NEWLY DRAWN illustration — not a modified version of the input photo and not a screenshot of anything.

REQUIREMENTS:
- Draw the diagram FROM SCRATCH as a clean digital illustration (like a textbook figure)
- Pure white background with clean black lines — nothing else
- Accurate geometry: correct shapes, curves, angles, and proportions
- Include all labels, annotations, axis labels, and arrows described
- Use clear, readable sans-serif fonts for all text/labels
- The output image must contain ONLY the diagram itself — no surrounding elements of any kind
- Do NOT include any equations, definitions, or handwritten text from the board
- High resolution and high contrast{diagram_block}{caption_block}{exclude_block}"""
    
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
                "temperature": 0.4,
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


def _build_prompt(
    existing_sections: list[dict] | None = None,
    has_previous_image: bool = False,
) -> str:
    """Build the full prompt, injecting existing section summaries when available.

    Args:
        existing_sections: List of dicts with keys section_id, type, and
            content_preview.  When None or empty the base prompt is returned.
        has_previous_image: When True, the message will contain two images
            (previous capture first, current capture second).  Extra instructions
            are appended so the AI merges information from both frames.
    """
    base = PROMPT

    # Multi-frame occlusion handling
    if has_previous_image:
        base += (
            "\n\nMULTI-FRAME CONTEXT:\n"
            "You are being given TWO images of the same board taken moments apart.\n"
            "- IMAGE 1 (first) is a PREVIOUS capture of the board.\n"
            "- IMAGE 2 (second) is the CURRENT/LATEST capture.\n\n"
            "A person (the professor) may be blocking parts of the board in one or both frames.\n"
            "RULES for multi-frame merging:\n"
            "- Use the CLEAREST view of each section across both frames.\n"
            "- If content is visible in the previous frame but blocked in the current frame, use the previous frame's version.\n"
            "- If content is visible in the current frame but was blocked before, use the current frame.\n"
            "- If content appears in BOTH frames, prefer the current frame (it may have updates).\n"
            "- If content is blocked in BOTH frames, omit it entirely — do NOT guess.\n"
            "- NEVER produce garbled or half-complete sections. If you cannot read something clearly in either frame, leave it out.\n"
            "- For diagrams: if the diagram is partially blocked in the current frame but was clear in the previous frame, describe the diagram based on the previous frame."
        )

    if not existing_sections:
        return base

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
        f"- Do NOT restart numbering from block-1.\n"
        f"- If a section's content is BLOCKED by a person in the current frame, "
        f"reuse the existing section_id with the SAME content (do NOT replace good content with partial/garbled content)."
    )
    return base + context


def _should_merge(prev: dict, curr: dict) -> bool:
    """Decide whether two consecutive non-diagram sections should be merged.

    Returns True ONLY when the previous block very clearly ends mid-sentence
    (no terminal punctuation AND doesn't end with display math).
    We intentionally keep this conservative — a false negative (not merging
    two blocks that could be joined) looks fine, but a false positive
    (wrongly gluing two independent blocks) corrupts the notes.
    """
    # Never merge diagrams
    if prev.get("type") == "diagram" or curr.get("type") == "diagram":
        return False

    prev_content = (prev.get("content") or "").rstrip()
    curr_content = (curr.get("content") or "").lstrip()

    if not prev_content or not curr_content:
        return False

    # If the previous block ends with display math ($$...$$), treat it as
    # self-contained — display equations typically terminate a thought.
    if prev_content.endswith("$$"):
        return False

    # If the current block starts with display math, it's likely a new
    # standalone equation block — don't merge.
    if curr_content.lstrip().startswith("$$"):
        return False

    # Strip trailing inline $ to find the real last prose character.
    check_prev = prev_content
    if check_prev.endswith("$") and not check_prev.endswith("$$"):
        # Walk backwards past the inline math to find what's before it
        # e.g. "is $\sin(x)$" → check the character before the opening $
        inner_start = check_prev.rfind("$", 0, len(check_prev) - 1)
        if inner_start > 0:
            check_prev = check_prev[:inner_start].rstrip()
        else:
            check_prev = check_prev[:-1].rstrip()

    # Terminal punctuation that signals end of a thought
    terminal_punct = {".", "!", "?", ":", ";", "—"}
    ends_with_punct = bool(check_prev) and check_prev[-1] in terminal_punct

    # Only merge when the previous block clearly trails off mid-sentence
    if not ends_with_punct:
        return True

    return False


def _merge_sections(sections: list[dict]) -> tuple[list[dict], list[str]]:
    """Post-process sections to merge consecutive blocks that were split mid-sentence.

    Preserves original section_ids as much as possible. When blocks are merged,
    the surviving block keeps the FIRST (earliest) section_id so existing DB
    rows are updated in-place rather than orphaned.

    Returns:
        (merged_sections, consumed_ids) — consumed_ids is the list of
        section_ids that were folded into another block and should be
        deleted from the DB.
    """
    if not sections:
        return sections, []

    merged: list[dict] = []
    consumed_ids: list[str] = []
    for section in sections:
        if not merged:
            merged.append(dict(section))
            continue

        prev = merged[-1]
        if _should_merge(prev, section):
            # Merge: append current content to previous block
            joiner = " " if not prev["content"].rstrip().endswith("\n") else ""
            prev["content"] = prev["content"].rstrip() + joiner + section["content"].lstrip()
            # Keep the more "specific" type if they differ (equation > note > step)
            type_priority = {"equation": 3, "definition": 3, "step": 2, "note": 1}
            if type_priority.get(section.get("type", ""), 0) > type_priority.get(prev.get("type", ""), 0):
                prev["type"] = section["type"]
            sid = section.get("section_id")
            if sid:
                consumed_ids.append(sid)
            logger.info(
                f"Merged section {section.get('section_id')} into {prev.get('section_id')}"
            )
        else:
            merged.append(dict(section))

    return merged, consumed_ids


def send_image_to_gemini(
    image_path: str,
    generate_diagrams: bool = True,
    existing_sections: list[dict] | None = None,
    previous_image_b64: str | None = None,
    previous_image_mime: str | None = None,
) -> tuple[list[dict], list[str]]:
    """Process chalkboard image and optionally generate images for diagrams.

    When generate_diagrams is True, diagram sections will have their image bytes
    attached as '_image_bytes' and '_image_ext' keys (to be uploaded by the caller).

    Args:
        image_path: Path to the chalkboard image.
        generate_diagrams: Whether to generate enhanced diagram images.
        existing_sections: Section summaries already stored for this room
            (each dict has section_id, type, content_preview), used to avoid
            duplicating notes across captures.
        previous_image_b64: Base64-encoded previous capture image (if available).
        previous_image_mime: MIME type of the previous image.

    Returns:
        (sections, consumed_ids) — sections is the list of section dicts;
        consumed_ids lists any section_ids that were merged into another
        block and should be deleted from the DB.
    """
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    ext = image_path.lower().rsplit(".", 1)[-1] if "." in image_path else "jpeg"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(ext, "image/jpeg")

    has_previous = previous_image_b64 is not None
    existing_ids = [s["section_id"] for s in existing_sections] if existing_sections else []
    prompt = _build_prompt(existing_sections, has_previous_image=has_previous)
    logger.info(
        f"Sending image to OpenRouter model={OPENROUTER_MODEL}, mime={mime}, "
        f"base64_len={len(image_data)}, existing_ids={existing_ids}, "
        f"has_previous_frame={has_previous}"
    )

    # Build message content: prompt text + optional previous image + current image
    content_parts: list[dict] = [{"type": "text", "text": prompt}]
    if has_previous:
        content_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:{previous_image_mime};base64,{previous_image_b64}"},
        })
    content_parts.append({
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{image_data}"},
    })

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
                    "content": content_parts,
                }
            ],
        },
        timeout=120,
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

    # Post-process: merge blocks that were incorrectly split mid-sentence
    sections, consumed_ids = _merge_sections(sections)
    logger.info(f"After merging: {len(sections)} sections, consumed IDs: {consumed_ids}")

    if generate_diagrams:
        for section in sections:
            sid = section.get("section_id")
            if section.get("type") != "diagram":
                continue

            result = generate_diagram_image(
                image_path,
                diagram_description=section.get("content"),
                all_sections=sections,
            )
            if result:
                img_bytes, img_ext = result
                section["_image_bytes"] = img_bytes
                section["_image_ext"] = img_ext
                logger.info(f"Generated diagram for section {sid}")
            else:
                logger.warning(f"Diagram generation failed for section {sid}")
    
    return sections, consumed_ids
