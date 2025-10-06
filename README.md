## Prompt Library

A lightweight, dependency-free local Prompt Library web app. Add, search, copy, export, and delete AI prompts. Data is stored entirely in your browser via `localStorage`.

### Features

- Add prompts with title + full content
- Automatic preview truncation in cards
- Copy full prompt (title + content) to clipboard
- 5-star rating for each prompt (persisted locally)
 - 5-star rating for each prompt (persisted locally)
 - Per-prompt notes: add, edit, delete plain text notes
- Local persistence using `localStorage`
 - JSON export & import with versioned schema, statistics, conflict resolution & rollback safety

### Tech Stack

- Plain HTML, CSS (custom dark developer theme), and vanilla JavaScript
- No build step, no external dependencies

### Run Locally

1. Open the folder in VS Code
2. Open `index.html`
3. Use the Live Server extension (or just open the file in a browser)

### File Overview

| File | Purpose |
|------|---------|
| `index.html` | App structure & template card markup |
| `styles.css` | Dark theme styling & layout |
| `app.js` | LocalStorage CRUD + UI logic |

### Data Format

Each saved prompt object:
```json
{
	"id": "krtx9m5w6v...", 
	"title": "Blog Outline Generator",
	"content": "You are an expert...",
		"createdAt": 1730829000000,
		"rating": 0
}
```

Notes are stored separately under `localStorage` key `promptNotes.v1` as a map:

```json
{
	"prompt-uuid": [
		{
			"noteId": "prompt-uuid-1730829000000",
			"promptId": "prompt-uuid",
			"text": "Remember to adjust tone for marketing audience.",
			"createdAt": 1730829000000,
			"updatedAt": 1730829000000
		}
	]
}
```

### Notes Feature Usage

1. Click the + button inside a prompt card's Notes section to add a note.
2. Edit existing notes with the Edit button; Save or Cancel changes.
3. Delete removes the note after confirmation (no undo).
4. Empty notes are rejected.
5. Data persists across sessions locally.

### Notes

- All data stays local. Clearing browser storage will delete prompts.
- Clipboard copy uses the standard async API with a fallback.
 - Export creates a file named like `prompt-library-export-YYYY-MM-DDTHH-MM-SS-mmmZ.json` containing prompts + notes.
 - Import: Choose merge (OK) to overwrite duplicates per confirmation; Cancel at prompt chooses replace (complete overwrite). Conflicts are asked individually when merging.

### Export / Import JSON Schema

```
{
	"version": 1,
	"exportedAt": "2025-10-06T12:34:56.789Z",
	"stats": {
		"totalPrompts": 12,
		"averageRating": 4.17,
		"mostUsedModel": "gpt-4o-mini"
	},
	"prompts": [ { /* prompt objects (with optional metadata) */ } ],
	"notes": { "<promptId>": [ { /* note objects */ } ] }
}
```

Validation steps during import:
1. Version compatibility check (currently only version 1 supported)
2. Prompt object shape & metadata date format
3. Notes referential integrity (each `promptId` exists in prompts array)
4. Rollback to a backup snapshot if any error occurs

Conflict Resolution (Merge Mode):
For each duplicate prompt ID you are asked to overwrite (OK) or keep existing (Cancel). Notes merge by `noteId` (incoming overwrites duplicates). New prompts & notes are appended.

Replace Mode:
Choosing replace discards existing prompts & notes after successful validation and installs the imported set entirely.

Rollback:
If any validation or storage write fails, the previous state is restored from an in-memory backup captured before import processing.

### Future Ideas (Not Implemented)

- Tagging & filtering by tag
- Reordering / pinning
- Markdown formatting & full-screen editing
- Import from JSON

---

Enjoy building better prompts! 🚀

# practical-prompt-engineering-code-exercise

This repo serves to hold the code generated from the Frontend Masters workshop Practical Prompt Engineering.