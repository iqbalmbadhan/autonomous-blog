#!/usr/bin/env python3
"""Zero-cost automated blog generator.

Pipeline:
    1. Groq   (llama-3.3-70b-versatile) -> SEO-optimized Markdown outline
    2. Gemini (gemini-3.8-flash)        -> full-length Markdown article
    3. Pollinations AI                  -> featured image
    4. WordPress REST API               -> post (draft by default)

Usage:
    python main.py "how to start a vegetable garden"
    python main.py --status publish "remote work productivity tips"
    python main.py --dry-run            # prompts for a topic, skips WordPress
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Mapping, TypeVar
from urllib.parse import quote, urlencode

import httpx
import markdown
import requests
from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from groq import Groq, GroqError

# Defaults; override with GROQ_MODEL / GEMINI_MODEL in .env when a model is retired.
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
DEFAULT_POLLINATIONS_BASE = "https://gen.pollinations.ai/image"
HTTP_TIMEOUT = 60
IMAGE_TIMEOUT = 180
MAX_RETRIES = 3
GEMINI_RETRIES = 5

REQUIRED_ENV_VARS: dict[str, str] = {
    "GROQ_API_KEY": "Free key from https://console.groq.com/keys",
    "GEMINI_API_KEY": "Free key from https://aistudio.google.com/apikey",
    "POLLINATIONS_API_KEY": "Free key from https://enter.pollinations.ai",
    "WP_URL": "Posts endpoint, e.g. https://yourdomain.com/wp-json/wp/v2/posts",
    "WP_USER": "Your WordPress username",
    "WP_APP_PASS": "WP Admin -> Users -> Profile -> Application Passwords",
}
# WordPress settings are not needed for --dry-run.
WP_ENV_VARS = {"WP_URL", "WP_USER", "WP_APP_PASS"}

log = logging.getLogger("blog-generator")
T = TypeVar("T")


class PipelineError(Exception):
    """A pipeline stage failed in a way the user should be told about."""


@dataclass(frozen=True)
class Config:
    groq_api_key: str
    gemini_api_key: str
    groq_model: str
    gemini_model: str
    pollinations_api_key: str
    pollinations_base_url: str
    wp_url: str
    wp_user: str
    wp_app_pass: str
    writing_guidance: str = ""


@dataclass(frozen=True)
class FeaturedImage:
    url: str
    alt_text: str
    data: bytes | None = None
    content_type: str = "image/jpeg"


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
def load_config(env_file: Path, require_wordpress: bool = True) -> Config:
    """Load .env and verify every required variable is present and non-empty."""
    load_dotenv(env_file)

    required = {
        name: hint
        for name, hint in REQUIRED_ENV_VARS.items()
        if require_wordpress or name not in WP_ENV_VARS
    }
    missing = [name for name in required if not os.getenv(name, "").strip()]
    if missing:
        lines = [
            "Missing required environment variables:",
            *(f"  - {name}: {REQUIRED_ENV_VARS[name]}" for name in missing),
            "",
            "To fix this:",
            f"  1. Copy the template:  cp .env.example {env_file}",
            f"  2. Open {env_file} and fill in the values listed above.",
            "  3. Re-run the script.",
        ]
        raise PipelineError("\n".join(lines))

    return config_from_mapping(os.environ)


def config_from_mapping(values: Mapping[str, str | None]) -> Config:
    """Build a Config from env-style values without checking for missing ones."""

    def get(name: str, default: str = "") -> str:
        return (values.get(name) or "").strip() or default

    guidance = [
        f"Target audience: {get('BLOG_AUDIENCE')}" if get("BLOG_AUDIENCE") else "",
        f"Tone and style: {get('BLOG_TONE')}" if get("BLOG_TONE") else "",
    ]
    return Config(
        groq_api_key=get("GROQ_API_KEY"),
        gemini_api_key=get("GEMINI_API_KEY"),
        groq_model=get("GROQ_MODEL", DEFAULT_GROQ_MODEL),
        gemini_model=get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
        pollinations_api_key=get("POLLINATIONS_API_KEY"),
        pollinations_base_url=get("POLLINATIONS_BASE_URL", DEFAULT_POLLINATIONS_BASE).rstrip("/"),
        wp_url=get("WP_URL").rstrip("/"),
        wp_user=get("WP_USER"),
        wp_app_pass=get("WP_APP_PASS"),
        writing_guidance="\n".join(line for line in guidance if line),
    )


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def with_retries(action: Callable[[], T], label: str, retries: int = MAX_RETRIES) -> T:
    """Run `action`, retrying transient HTTP failures (timeouts, 429, 5xx)."""
    for attempt in range(1, retries + 1):
        try:
            return action()
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status != 429 and status < 500 or attempt == retries:
                raise
            reason = f"HTTP {status}"
        except (requests.ConnectionError, requests.Timeout) as exc:
            if attempt == retries:
                raise
            reason = type(exc).__name__
        delay = 2**attempt
        log.warning("%s failed (%s); retrying in %ss (%s/%s)", label, reason, delay, attempt, retries)
        time.sleep(delay)
    raise AssertionError("unreachable")


def slugify(text: str, max_length: int = 60) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_length].rstrip("-") or "post"


def strip_code_fences(text: str) -> str:
    """Remove a ```markdown ... ``` wrapper that LLMs sometimes add."""
    match = re.match(r"^\s*```(?:markdown|md)?\s*\n(.*?)\n```\s*$", text, re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text.strip()


def extract_title(markdown_text: str, fallback: str) -> str:
    """Return the first H1 heading, or a title-cased fallback."""
    match = re.search(r"^#\s+(.+?)\s*#*\s*$", markdown_text, re.MULTILINE)
    title = match.group(1) if match else fallback.title()
    return re.sub(r"[*_`]", "", title).strip()


def remove_first_h1(markdown_text: str) -> str:
    """WordPress renders the title itself, so drop the duplicate H1 from the body."""
    return re.sub(r"^#\s+.+\n?", "", markdown_text, count=1, flags=re.MULTILINE).lstrip()


def describe_http_error(exc: requests.RequestException) -> str:
    response = getattr(exc, "response", None)
    if response is None:
        return str(exc)
    try:
        detail = response.json().get("message", response.text)
    except ValueError:
        detail = response.text
    return f"HTTP {response.status_code}: {detail[:300]}"


# --------------------------------------------------------------------------- #
# Step 1: Outline (Groq)
# --------------------------------------------------------------------------- #
OUTLINE_SYSTEM_PROMPT = """You are a senior SEO content strategist.
Produce blog outlines in clean Markdown only, with no preamble or closing remarks."""

OUTLINE_PROMPT = """Create a detailed, SEO-optimized blog post outline for the topic: "{topic}"

Use exactly this structure:

# <Compelling, keyword-rich title under 60 characters>

**Meta description:** <150-160 characters including the primary keyword>

**Primary keyword:** <one keyword phrase>

**Secondary keywords:** <5-8 comma-separated related keywords and long-tail phrases>

**Search intent:** <informational / commercial / transactional / navigational>

## <H2 section>
- Key point to cover
### <H3 sub-section>
- Key point to cover

Requirements:
- Start with an introduction section and end with a conclusion and an FAQ section (4-5 questions as H3s).
- Include 5-8 H2 sections in between, each with 2-4 H3 sub-sections.
- Under each heading, list the focus sub-topics and which keywords to weave in.
- Output only the Markdown outline."""


def with_guidance(prompt: str, guidance: str) -> str:
    return f"{prompt}\n\nWrite for this blog's readers:\n{guidance}" if guidance else prompt


def generate_outline(client: Groq, model: str, topic: str, guidance: str = "") -> str:
    log.info("Step 1/4: Generating SEO outline with Groq (%s)...", model)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": OUTLINE_SYSTEM_PROMPT},
                {"role": "user", "content": with_guidance(OUTLINE_PROMPT.format(topic=topic), guidance)},
            ],
            temperature=0.6,
            max_completion_tokens=2048,
        )
    except GroqError as exc:
        raise PipelineError(f"Groq outline generation failed: {exc}") from exc

    outline = strip_code_fences(response.choices[0].message.content or "")
    if not outline:
        raise PipelineError("Groq returned an empty outline.")
    log.info("  Outline ready (%d headings).", len(re.findall(r"^#{1,3}\s", outline, re.MULTILINE)))
    return outline


# --------------------------------------------------------------------------- #
# Step 2: Article (Gemini)
# --------------------------------------------------------------------------- #
ARTICLE_SYSTEM_PROMPT = """You are an expert long-form blog writer who writes engaging,
accurate, SEO-friendly articles. Respond with clean Markdown only: no code fences
around the whole response, no HTML, no preamble or commentary."""

ARTICLE_PROMPT = """Write a comprehensive, full-length blog article (1,800-2,500 words) on "{topic}",
following this outline exactly:

{outline}

Rules:
- Begin with a single H1 title (# ...), using the outline's title.
- Use the outline's H2 (##) and H3 (###) headings in the same order.
- Do NOT include the meta description or keyword lists as visible text.
- Use the primary keyword in the first 100 words and naturally throughout; weave in secondary keywords.
- Short paragraphs (2-4 sentences), bullet or numbered lists where helpful, and **bold** for key ideas.
- Give concrete, practical examples. Do not invent statistics, quotes, or sources.
- Write the FAQ answers in 2-3 sentences each.
- Output clean Markdown only."""


def draft_article(client: genai.Client, model: str, topic: str, outline: str, guidance: str = "") -> str:
    log.info("Step 2/4: Drafting full article with Gemini (%s)... this can take a minute.", model)
    for attempt in range(1, GEMINI_RETRIES + 1):
        try:
            # Streaming keeps the connection busy, so proxies don't drop it during long articles.
            stream = client.models.generate_content_stream(
                model=model,
                contents=with_guidance(ARTICLE_PROMPT.format(topic=topic, outline=outline), guidance),
                config=genai_types.GenerateContentConfig(
                    system_instruction=ARTICLE_SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=16384,
                ),
            )
            text = "".join(chunk.text or "" for chunk in stream)
            break
        except (genai_errors.APIError, httpx.TransportError) as exc:
            # Free-tier Gemini often returns 503 "high demand" or 429, or drops the connection;
            # these clear up within seconds.
            code = getattr(exc, "code", None)
            if isinstance(exc, genai_errors.APIError) and code not in (429, 500, 503, 504):
                raise PipelineError(f"Gemini article generation failed: {exc}") from exc
            reason = f"HTTP {code}" if code else "connection dropped"
            if attempt == GEMINI_RETRIES:
                raise PipelineError(f"Gemini article generation failed after {attempt} tries ({reason}).") from exc
            delay = 5 * 2 ** (attempt - 1)
            log.warning("  Gemini busy (%s); retrying in %ss (%s/%s)", reason, delay, attempt, GEMINI_RETRIES)
            time.sleep(delay)

    article = strip_code_fences(text)
    if not article:
        raise PipelineError("Gemini returned an empty article (it may have been blocked by safety filters).")
    log.info("  Article ready (~%d words).", len(article.split()))
    return article


# --------------------------------------------------------------------------- #
# Step 3: Featured image (Pollinations)
# --------------------------------------------------------------------------- #
def default_image_prompt(topic: str, title: str) -> str:
    return (
        f"Professional blog featured image for an article titled '{title}' about {topic}. "
        "Modern editorial photography style, vibrant natural lighting, high detail, "
        "clean composition, no text, no watermark."
    )


def build_image_url(base_url: str, topic: str, title: str, prompt: str | None = None) -> str:
    prompt = prompt or default_image_prompt(topic, title)
    params = {"model": "flux", "width": 1280, "height": 720, "nologo": "true", "seed": int(time.time()) % 100000}
    return f"{base_url}/{quote(prompt, safe='')}?{urlencode(params)}"


def fetch_featured_image(config: Config, topic: str, title: str, prompt: str | None = None) -> FeaturedImage:
    """Build the Pollinations URL and download the image.

    The API key is sent only in the Authorization header, never in the URL, so it
    cannot leak into published post content.
    """
    log.info("Step 3/4: Generating featured image with Pollinations AI...")
    url = build_image_url(config.pollinations_base_url, topic, title, prompt)
    image = FeaturedImage(url=url, alt_text=title)

    def download() -> requests.Response:
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {config.pollinations_api_key}"},
            timeout=IMAGE_TIMEOUT,
        )
        response.raise_for_status()
        return response

    try:
        response = with_retries(download, "Pollinations image download")
    except requests.RequestException as exc:
        log.warning("  Could not download the image (%s); the post will link to it instead.", describe_http_error(exc))
        return image

    content_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
    if not content_type.startswith("image/"):
        log.warning("  Pollinations returned %s instead of an image; the post will link to it instead.", content_type)
        return image

    log.info("  Image ready (%.0f KB).", len(response.content) / 1024)
    return FeaturedImage(url=url, alt_text=title, data=response.content, content_type=content_type)


# --------------------------------------------------------------------------- #
# Step 4: Publish (WordPress REST API)
# --------------------------------------------------------------------------- #
class WordPressClient:
    def __init__(self, posts_url: str, user: str, app_password: str) -> None:
        self.posts_url = posts_url
        # WP_URL points at .../wp/v2/posts; the media endpoint sits beside it.
        self.media_url = re.sub(r"/posts$", "/media", posts_url)
        self.session = requests.Session()
        self.session.auth = (user, app_password.replace(" ", ""))
        self.session.headers["User-Agent"] = "zero-cost-blog-generator/1.0"

    def _post(self, url: str, label: str, **kwargs: object) -> dict:
        def send() -> requests.Response:
            response = self.session.post(url, timeout=HTTP_TIMEOUT, **kwargs)
            response.raise_for_status()
            return response

        try:
            return with_retries(send, label).json()
        except requests.RequestException as exc:
            hint = ""
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (401, 403):
                hint = " (check WP_USER / WP_APP_PASS and that the user can publish posts)"
            elif status == 404:
                hint = " (check that WP_URL ends in /wp-json/wp/v2/posts and permalinks are enabled)"
            raise PipelineError(f"WordPress {label} failed: {describe_http_error(exc)}{hint}") from exc
        except ValueError as exc:
            raise PipelineError(f"WordPress {label} returned a non-JSON response.") from exc

    def upload_image(self, image: FeaturedImage, slug: str) -> int:
        extension = {"image/png": "png", "image/webp": "webp"}.get(image.content_type, "jpg")
        media = self._post(
            self.media_url,
            "media upload",
            data=image.data,
            headers={
                "Content-Type": image.content_type,
                "Content-Disposition": f'attachment; filename="{slug}.{extension}"',
            },
        )
        media_id = int(media["id"])
        try:
            self._post(f"{self.media_url}/{media_id}", "media alt-text update", json={"alt_text": image.alt_text})
        except PipelineError as exc:
            log.warning("  %s", exc)  # alt text is nice to have, not worth failing over
        return media_id

    def create_post(
        self,
        title: str,
        html: str,
        status: str,
        excerpt: str,
        featured_media: int | None,
        post_id: int | None = None,
        date_gmt: str | None = None,
    ) -> dict:
        """Create a post, or update `post_id` if the post already exists in WordPress."""
        payload: dict[str, object] = {"title": title, "content": html, "status": status, "excerpt": excerpt}
        if featured_media:
            payload["featured_media"] = featured_media
        if date_gmt:
            payload["date_gmt"] = date_gmt
        if post_id:
            return self._post(f"{self.posts_url}/{post_id}", "post update", json=payload)
        return self._post(self.posts_url, "post creation", json=payload)

    def current_user(self) -> dict:
        """Return the authenticated user; used to test the connection."""
        users_url = re.sub(r"/posts$", "/users/me", self.posts_url)
        try:
            response = self.session.get(users_url, params={"context": "edit"}, timeout=HTTP_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            raise PipelineError(describe_http_error(exc)) from exc
        except ValueError as exc:
            raise PipelineError("WordPress returned a non-JSON response; check WP_URL.") from exc


def admin_edit_url(wp_url: str, post_id: int) -> str:
    return re.sub(r"/wp-json/.*$", f"/wp-admin/post.php?post={post_id}&action=edit", wp_url)


def extract_meta_description(outline: str) -> str:
    match = re.search(r"\*\*Meta description:\*\*\s*(.+)", outline, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def extract_primary_keyword(outline: str) -> str:
    match = re.search(r"\*\*Primary keyword:\*\*\s*(.+)", outline, re.IGNORECASE)
    return match.group(1).strip().strip("\"'") if match else ""


def markdown_to_html(markdown_text: str) -> str:
    return markdown.markdown(markdown_text, extensions=["extra", "sane_lists"])


def build_post_html(article_body: str, image: FeaturedImage, inline_image: bool) -> str:
    html = markdown_to_html(article_body)
    if inline_image:
        alt = image.alt_text.replace('"', "&quot;")
        html = f'<figure class="wp-block-image"><img src="{image.url}" alt="{alt}" /></figure>\n{html}'
    return html


def publish_to_wordpress(
    config: Config, title: str, article_body: str, outline: str, image: FeaturedImage, status: str
) -> dict:
    log.info("Step 4/4: Publishing to WordPress as '%s'...", status)
    wp = WordPressClient(config.wp_url, config.wp_user, config.wp_app_pass)

    media_id: int | None = None
    if image.data:
        try:
            media_id = wp.upload_image(image, slugify(title))
            log.info("  Featured image uploaded (media ID %s).", media_id)
        except PipelineError as exc:
            log.warning("  %s; embedding the image URL in the post instead.", exc)

    html = build_post_html(article_body, image, inline_image=media_id is None)
    post = wp.create_post(title, html, status, extract_meta_description(outline), media_id)
    log.info("  Post created (ID %s).", post.get("id"))
    return post


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def save_local_copy(output_dir: Path, title: str, outline: str, article: str, image: FeaturedImage) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = output_dir / f"{stamp}-{slugify(title)}"
    base.with_suffix(".outline.md").write_text(outline, encoding="utf-8")
    base.with_suffix(".md").write_text(f"![{image.alt_text}]({image.url})\n\n{article}\n", encoding="utf-8")
    if image.data:
        extension = {"image/png": ".png", "image/webp": ".webp"}.get(image.content_type, ".jpg")
        base.with_suffix(extension).write_bytes(image.data)
    return base.with_suffix(".md")


def run(topic: str, config: Config, status: str, dry_run: bool, output_dir: Path) -> None:
    started = time.monotonic()
    log.info("Topic: %s", topic)

    outline = generate_outline(Groq(api_key=config.groq_api_key), config.groq_model, topic, config.writing_guidance)
    article = draft_article(
        genai.Client(api_key=config.gemini_api_key), config.gemini_model, topic, outline, config.writing_guidance
    )
    title = extract_title(article, fallback=extract_title(outline, fallback=topic))
    image = fetch_featured_image(config, topic, title)

    saved = save_local_copy(output_dir, title, outline, article, image)
    log.info("Saved local copy: %s", saved)

    if dry_run:
        log.info("Dry run: skipping WordPress. Done in %.0fs.", time.monotonic() - started)
        return

    post = publish_to_wordpress(config, title, remove_first_h1(article), outline, image, status)
    log.info("Done in %.0fs: \"%s\"", time.monotonic() - started, title)
    if post.get("link"):
        log.info("  View: %s", post["link"])
    if post.get("id"):
        log.info("  Edit: %s", admin_edit_url(config.wp_url, post["id"]))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an SEO blog post with Groq + Gemini + Pollinations and post it to WordPress.",
    )
    parser.add_argument("topic", nargs="*", help="Blog topic or seed keyword (prompted for if omitted)")
    parser.add_argument(
        "--status",
        choices=["draft", "publish", "pending", "private"],
        default="draft",
        help="WordPress post status (default: draft)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Generate content locally without posting to WordPress")
    parser.add_argument("--output-dir", type=Path, default=Path("output"), help="Where local copies are saved")
    parser.add_argument("--env-file", type=Path, default=Path(".env"), help="Path to the .env file (default: .env)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show debug logging")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
    )
    if not args.verbose:
        for noisy in ("httpx", "httpcore", "urllib3", "google_genai"):
            logging.getLogger(noisy).setLevel(logging.WARNING)

    try:
        config = load_config(args.env_file, require_wordpress=not args.dry_run)
        topic = " ".join(args.topic).strip()
        if not topic:
            topic = input("Enter a blog topic or seed keyword: ").strip()
        if not topic:
            raise PipelineError("No topic given. Pass one as an argument, e.g. python main.py \"best hiking trails\".")
        run(topic, config, args.status, args.dry_run, args.output_dir)
    except PipelineError as exc:
        log.error("%s", exc)
        return 1
    except (KeyboardInterrupt, EOFError):
        log.error("Cancelled.")
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
