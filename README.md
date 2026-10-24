# Zero-Cost Automated Blog Generator

A Python script that turns a topic or seed keyword into a full SEO blog post and sends it to WordPress. Every service it uses has a free tier.

| Step | Service | What it does |
|------|---------|--------------|
| 1 | **Groq** (`llama-3.3-70b-versatile`) | Writes an SEO outline in Markdown: title, meta description, keywords, H2/H3 structure |
| 2 | **Google Gemini** (`gemini-3.8-flash`) | Writes the full article (about 1,800–2,500 words) from that outline in clean Markdown |
| 3 | **Pollinations AI** | Makes a 1280×720 featured image that matches the topic |
| 4 | **WordPress REST API** | Uploads the image as the featured image and creates the post |

Posts are created as **drafts** by default, so you can review them before they go live. Every run also saves a local copy (outline, article and image) in `output/`.

## Requirements

- Python 3.10+
- A WordPress site (5.6+) with the REST API reachable and **pretty permalinks** turned on
- Free API keys:
  - Groq: <https://console.groq.com/keys>
  - Gemini: <https://aistudio.google.com/apikey>
  - Pollinations: <https://enter.pollinations.ai>

## Setup

### 1. Create a virtual environment

```bash
cd autonomous-blog
python3 -m venv .venv

# macOS / Linux
source .venv/bin/activate
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure `.env`

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and fill in every value:

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Your Groq API key |
| `GEMINI_API_KEY` | Your Google AI Studio API key |
| `POLLINATIONS_API_KEY` | Your Pollinations API key |
| `WP_URL` | The full posts endpoint, e.g. `https://yourdomain.com/wp-json/wp/v2/posts` |
| `WP_USER` | Your WordPress username |
| `WP_APP_PASS` | A WordPress **Application Password** (not your login password) |

**To create a WordPress Application Password:** go to WP Admin → Users → Profile, scroll to *Application Passwords*, enter a name (e.g. "Blog Generator") and click *Add New Application Password*. Copy the password it shows; the spaces in it are fine. The user needs at least the Author role to publish posts, and Editor or Administrator works too.

Optional: set `GROQ_MODEL` or `GEMINI_MODEL` to use a different model (defaults: `llama-3.3-70b-versatile` and `gemini-3.8-flash`). Google no longer offers `gemini-2.5-flash` to new API keys.

If any variable is missing, the script stops before calling any API and tells you which ones to add.

`.env` is listed in `.gitignore`. **Never commit it.**

## Usage

```bash
# Pass the topic as an argument
python main.py "how to start a vegetable garden"

# Or run it without one and type the topic when asked
python main.py

# Publish right away instead of saving as a draft
python main.py --status publish "best budget travel tips for 2026"

# Generate locally only, without posting to WordPress (WP_* variables not needed)
python main.py --dry-run "beginner guide to sourdough"
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--status` | `draft` | WordPress status: `draft`, `publish`, `pending` or `private` |
| `--dry-run` | off | Skip WordPress and only save files to `output/` |
| `--output-dir` | `output` | Folder for the local copies |
| `--env-file` | `.env` | Path to a different env file |
| `-v`, `--verbose` | off | Show debug logs |

### Example output

```
12:01:02  INFO     Topic: how to start a vegetable garden
12:01:02  INFO     Step 1/4: Generating SEO outline with Groq (llama-3.3-70b-versatile)...
12:01:04  INFO       Outline ready (31 headings).
12:01:04  INFO     Step 2/4: Drafting full article with Gemini (gemini-3.8-flash)... this can take a minute.
12:01:41  INFO       Article ready (~2214 words).
12:01:41  INFO     Step 3/4: Generating featured image with Pollinations AI...
12:01:52  INFO       Image ready (148 KB).
12:01:52  INFO     Saved local copy: output/20261024-120152-how-to-start-a-vegetable-garden.md
12:01:52  INFO     Step 4/4: Publishing to WordPress as 'draft'...
12:01:54  INFO       Featured image uploaded (media ID 381).
12:01:55  INFO       Post created (ID 382).
12:01:55  INFO     Done in 53s: "How to Start a Vegetable Garden: A Beginner's Guide"
12:01:55  INFO       Edit: https://yourdomain.com/wp-admin/post.php?post=382&action=edit
```

## How it works

- **Markdown → HTML.** WordPress expects HTML, so the article Markdown is converted (tables and lists included) before it is posted. The H1 is removed from the body because WordPress shows the post title separately. The meta description from the outline becomes the post excerpt.
- **Featured image.** The script downloads the image from Pollinations and uploads it to your WordPress Media Library, then sets it as the post's featured image with the title as alt text. The Pollinations key is sent only in a request header, so it never appears in a URL or in published content. If the download or upload fails, the post is still created, with the image URL embedded at the top instead.
- **Errors.** Timeouts, HTTP 429 and 5xx errors from Pollinations and WordPress are retried with exponential backoff. Groq and Gemini errors, and WordPress auth or endpoint errors, stop the run with a clear message (for example, a 401 points you to `WP_USER`/`WP_APP_PASS`). The script exits with a non-zero code on failure, so it works with cron and CI.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401` / `403` from WordPress | Check `WP_USER` and `WP_APP_PASS`. Some hosts and security plugins block the `Authorization` header or Application Passwords, so allow them there. |
| `404` from WordPress | `WP_URL` must end in `/wp-json/wp/v2/posts`, and permalinks must not be set to "Plain". |
| Groq / Gemini `429` | You hit a free-tier rate limit. Wait a minute and try again. |
| No featured image | Check `POLLINATIONS_API_KEY`. If Pollinations changes its endpoint, set `POLLINATIONS_BASE_URL` in `.env`. |
| Gemini `404 NOT_FOUND` for the model | Google retired that model for your key. Set `GEMINI_MODEL` in `.env` to the model named in the error. |
| Gemini returns an empty article | The topic may have triggered safety filters. Rephrase it. |
