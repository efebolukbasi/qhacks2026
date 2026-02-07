# Diagram Image Generation Feature

## Overview

The chalkboard capture system now generates **actual images** for diagrams detected on the chalkboard, rather than just text descriptions or SVG placeholders. This provides students with high-quality visual representations of diagrams drawn during lectures.

## How It Works

1. **Chalkboard Capture**: The system captures images from the IP camera as usual
2. **Content Analysis**: The main AI model (Gemini) analyzes the chalkboard and extracts:
   - Text content (definitions, equations, notes)
   - Diagram descriptions (detailed descriptions of any diagrams found)
3. **Image Enhancement**: For each diagram detected:
   - The system sends the **original chalkboard image** + description to `google/gemini-3-pro-image-preview` (Nano Banana) via OpenRouter
   - Nano Banana performs **image-to-image enhancement**: cleans up the chalkboard photo, enhances clarity, and produces a professional diagram
   - The enhanced image is saved to the `backend/uploads/diagrams/` directory
   - A reference to the image is stored in the database
4. **Display**: The frontend displays the enhanced diagram image to students

## Technical Implementation

### Backend Changes

#### `gemini_service.py`
- Added `generate_diagram_image()` function that:
  - Takes the **original chalkboard image** and a text description
  - Sends both to OpenRouter API with `google/gemini-3-pro-image-preview` (Nano Banana)
  - Uses **image-to-image enhancement** to clean up and enhance the diagram
  - Extracts the enhanced image from the response (base64 format)
  - Saves the enhanced image to disk
  - Returns the file path

- Updated `send_image_to_gemini()` function to:
  - Accept `generate_diagrams` and `diagrams_dir` parameters
  - Automatically enhance images for all diagram sections
  - Pass the original chalkboard image to `generate_diagram_image()`
  - Add `image_url` field to diagram sections

#### `main.py`
- Created `DIAGRAMS_DIR` for storing generated images
- Mounted `/diagrams` static file route to serve generated images
- Updated upload handler to pass `diagrams_dir` to `send_image_to_gemini()`

#### `database.py`
- Added `caption` and `image_url` columns to `lecture_notes` table
- Updated `upsert_notes_sync()` to handle these new fields
- Updated `get_all_notes_sync()` to return caption and image_url

### Frontend Changes

#### `page.tsx` (Student View)
- Added `image_url` field to `NoteSection` interface
- Updated diagram rendering to:
  - Display generated image if `image_url` is present
  - Fall back to HTML content if no image is available
  - Show caption below the diagram

#### `professor/page.tsx`
- Added `image_url` field to `NoteSection` interface for consistency

## Configuration

### Environment Variables

```bash
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_MODEL=google/gemini-2.0-flash-001
```

The diagram image generation uses `google/gemini-3-pro-image-preview` automatically (hardcoded in `gemini_service.py`).

### Image Storage

- Generated diagrams are stored in: `backend/uploads/diagrams/`
- Naming format: `diagram_<uuid>.<ext>`
- Served via: `http://localhost:8000/diagrams/<filename>`

## Benefits

1. **Preserves Original Content**: Image-to-image enhancement maintains the exact structure and details from the chalkboard
2. **Better Visual Quality**: AI enhancement cleans up chalk dust, improves contrast, and produces professional-looking diagrams
3. **One-Step Process**: Direct image enhancement (vs. text description → generation) is faster and more accurate
4. **Accessibility**: Enhanced images can be zoomed, saved, and printed easily
5. **Consistency**: Diagrams maintain a consistent clean style while preserving original intent
6. **Integration**: Seamlessly integrated with existing note-taking system

## Fallback Behavior

If image generation fails for any reason:
- The system logs the error
- No `image_url` field is added to the section
- Frontend falls back to displaying the text description (if available)
- The note-taking system continues to work normally

## Future Enhancements

Potential improvements:
- Allow configuration of image generation model via environment variable
- Add retry logic for failed image generations
- Support different diagram styles (hand-drawn vs. technical)
- Cache generated images to avoid regenerating identical diagrams
- Add image editing/annotation capabilities
