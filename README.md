# Autoblog: Zero-Cost Automated Blog Generator

Turn a topic or seed keyword into a full SEO blog post with a featured image, review it, and publish it to WordPress. Every service it uses has a free tier.

There are two ways to use it:

- **The dashboard** (recommended): a local web app where you add topics, watch posts being written, review and edit them with an SEO checklist, then publish or schedule with one click.
- **The command line**: `python main.py "your topic"`, handy for cron jobs and scripts.

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

> Using the dashboard? You can skip this step and paste your keys on its **Settings** page instead. It writes the same `.env` file.

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

## The dashboard

```bash
python app.py
```

Your browser opens at <http://127.0.0.1:8000>. The dashboard only listens on your own computer, because it can read your keys and post to your site. Stop it with `Ctrl+C`. Use `--port 8080` to change the port, or `--no-browser` to skip opening the browser.

**First time?** The dashboard shows a short checklist: add your AI keys, connect WordPress, and write your first post. Each step has a button that takes you where you need to go, and **Settings** has a **Test** button for every service, so you know your keys work before you write anything.

### How you'll use it day to day

1. **Add topics.** Type one into *What should we write about next?* on the dashboard, or press **N** (or click **New post**) to paste many at once. Stuck for ideas? Enter your blog's niche and click **Suggest** to get topics people search for, then click the ones you like.
2. **Let it write.** Each post shows a live tracker (Outline → Article → Image) and usually takes 1–3 minutes. Several posts are written one after another, so you can close the page and come back later.
3. **Review.** Finished posts move to **Ready to review**. On the review screen you can:
   - read the post as it will look on your site, or edit the text (it saves automatically)
   - adjust the title, the search snippet (meta description) and the focus keyword
   - follow the **SEO check**: a score out of 100 with plain-English tips, such as keyword placement, length and headings
   - make a new featured image, optionally describing what you want
   - click **Rewrite with AI** to start the post over
4. **Publish.** Choose **Publish now**, **Schedule** (WordPress publishes it at the time you pick, even if your computer is off), or **Save as WordPress draft**. Editing a post that's already live and clicking **Update live post** replaces it on your site.

### Screens

| Screen | What it's for |
|--------|---------------|
| **Dashboard** | Counts for each stage, *Needs your attention* (posts to review or retry), posts being written, upcoming scheduled posts, a light for each service connection, and recent activity |
| **Posts** | A board with columns *Ideas → Writing → Ready to review → Scheduled → Published*, plus search and **Write all ideas** |
| **Post** | The writing tracker, the review editor, or a plain-language error with **Try again**, depending on where the post is |
| **Settings** | API keys (with free-key links and **Test** buttons), your WordPress site, writing style (audience and tone), and the AI models |

When something fails, you see why and what to do next. Busy AI services are retried automatically, and a failed rewrite can go back to the previous draft. Light and dark mode follow your system, and the toggle sits at the bottom of the sidebar. The layout works on phones too.

Posts, their history and images are stored in `data/`, which git ignores. Back up that folder to keep your post history.

## Command line

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

## Project files

| File | Purpose |
|------|---------|
| `main.py` | The generation pipeline and the command-line tool |
| `app.py` | The dashboard web server |
| `worker.py` | Background worker that writes queued posts one at a time |
| `store.py` | SQLite storage for posts and activity (`data/autoblog.db`) |
| `settings.py` | Reads and writes `.env` for the Settings page |
| `seo.py` | The SEO checklist |
| `static/` | The dashboard's HTML, CSS and JavaScript (no build step) |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401` / `403` from WordPress | Check `WP_USER` and `WP_APP_PASS`. Some hosts and security plugins block the `Authorization` header or Application Passwords, so allow them there. |
| `404` from WordPress | `WP_URL` must end in `/wp-json/wp/v2/posts`, and permalinks must not be set to "Plain". |
| Groq / Gemini `429` | You hit a free-tier rate limit. Wait a minute and try again. |
| No featured image | Check `POLLINATIONS_API_KEY`. If Pollinations changes its endpoint, set `POLLINATIONS_BASE_URL` in `.env`. |
| Gemini `404 NOT_FOUND` for the model | Google retired that model for your key. Set `GEMINI_MODEL` in `.env` to the model named in the error. |
| Dashboard won't start: "address already in use" | Another program is using port 8000. Run `python app.py --port 8080`. |
| Gemini says it's busy, or writing takes several tries | The free tier gets overloaded at peak times. Autoblog retries automatically; if a post still fails, click **Try again** a little later. |
| Gemini returns an empty article | The topic may have triggered safety filters. Rephrase it. |
