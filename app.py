#!/usr/bin/env python3
"""Autoblog dashboard: a local web app around the blog generator pipeline.

Run:  python app.py   then open http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import logging
import threading
import webbrowser
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal
from urllib.parse import quote

import httpx
import requests
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from groq import Groq, GroqError
from pydantic import BaseModel, Field

import main
import seo
import settings
import store
from worker import Worker, save_image

STATIC_DIR = Path(__file__).resolve().parent / "static"
SERVICES = ("groq", "gemini", "pollinations", "wordpress")

log = logging.getLogger("blog-generator.app")
worker = Worker()
service_status: dict[str, dict[str, str]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    store.init()
    worker.start()
    yield


app = FastAPI(title="Autoblog", docs_url=None, redoc_url=None, lifespan=lifespan)


# --------------------------------------------------------------------------- #
# Request bodies
# --------------------------------------------------------------------------- #
class NewPosts(BaseModel):
    topics: list[str] = Field(min_length=1, max_length=50)
    generate: bool = False


class PostEdit(BaseModel):
    topic: str | None = None
    title: str | None = None
    meta_description: str | None = None
    keyword: str | None = None
    article: str | None = None
    status: Literal["review"] | None = None  # "back to the previous draft" after a failed rewrite


class PreviewRequest(BaseModel):
    title: str = ""
    meta_description: str = ""
    keyword: str = ""
    article: str = ""
    has_image: bool = False


class ImageRequest(BaseModel):
    prompt: str | None = None


class PublishRequest(BaseModel):
    mode: Literal["publish", "schedule", "draft"]
    date_gmt: str | None = None  # "YYYY-MM-DDTHH:MM:SS" in UTC, for mode="schedule"


class SuggestRequest(BaseModel):
    niche: str = Field(min_length=2, max_length=200)
    count: int = Field(default=8, ge=1, le=15)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def require_post(post_id: int) -> dict[str, Any]:
    post = store.get_post(post_id)
    if post is None:
        raise HTTPException(404, "That post no longer exists.")
    return post


def require_keys(names: tuple[str, ...], where: str) -> main.Config:
    missing = settings.missing(names)
    if missing:
        raise HTTPException(400, f"{where} isn't set up yet. Add {', '.join(missing)} in Settings.")
    return settings.load_config()


def post_view(post: dict[str, Any]) -> dict[str, Any]:
    config = settings.load_config()
    post["image_src"] = f"/images/{post['image_file']}" if post.get("image_file") else post.get("image_url")
    post["wp_edit_url"] = (
        main.admin_edit_url(config.wp_url, post["wp_post_id"]) if post.get("wp_post_id") and config.wp_url else None
    )
    post["default_image_prompt"] = main.default_image_prompt(post["topic"], post.get("title") or post["topic"])
    return post


def setup_state() -> dict[str, Any]:
    return {
        "ai_ready": not settings.missing(settings.AI_KEYS),
        "wordpress_ready": not settings.missing(settings.WP_KEYS),
        "missing": settings.missing(settings.AI_KEYS + settings.WP_KEYS),
    }


# --------------------------------------------------------------------------- #
# Pages
# --------------------------------------------------------------------------- #
@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
store.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=store.IMAGES_DIR), name="images")


# --------------------------------------------------------------------------- #
# Dashboard + posts
# --------------------------------------------------------------------------- #
@app.get("/api/summary")
def summary() -> dict[str, Any]:
    posts = store.list_posts()
    now = store.now()
    return {
        "counts": store.status_counts(),
        "attention": [p for p in posts if p["status"] in ("review", "failed")][:6],
        "in_progress": [p for p in posts if p["status"] in ("queued", "generating")],
        "upcoming": sorted(
            (p for p in posts if p["status"] == "scheduled" and (p["scheduled_at"] or "") > now),
            key=lambda p: p["scheduled_at"],
        )[:5],
        "activity": store.recent_activity(),
        "setup": setup_state(),
        "services": service_status,
        "total": len(posts),
    }


@app.get("/api/posts")
def list_posts() -> list[dict[str, Any]]:
    return store.list_posts()


@app.post("/api/posts")
def create_posts(body: NewPosts) -> dict[str, Any]:
    topics = [" ".join(t.split()) for t in body.topics if t.strip()]
    if not topics:
        raise HTTPException(400, "Type at least one topic.")
    if body.generate:
        require_keys(settings.AI_KEYS, "AI writing")
    ids = [store.create_post(topic[:300], "queued" if body.generate else "idea") for topic in topics]
    noun = "post" if len(ids) == 1 else "posts"
    store.add_activity(
        ids[0] if len(ids) == 1 else None,
        "queued" if body.generate else "idea",
        f"Started writing {len(ids)} {noun}" if body.generate else f"Added {len(ids)} new idea{'s' if len(ids) > 1 else ''}",
    )
    if body.generate:
        worker.wake()
    return {"ids": ids}


@app.get("/api/posts/{post_id}")
def get_post(post_id: int) -> dict[str, Any]:
    return post_view(require_post(post_id))


@app.patch("/api/posts/{post_id}")
def edit_post(post_id: int, body: PostEdit) -> dict[str, str]:
    require_post(post_id)
    fields = body.model_dump(exclude_none=True)
    if fields:
        store.update_post(post_id, **fields)
    return {"updated_at": store.now()}


@app.delete("/api/posts/{post_id}")
def delete_post(post_id: int) -> dict[str, bool]:
    post = require_post(post_id)
    if post.get("image_file"):
        (store.IMAGES_DIR / post["image_file"]).unlink(missing_ok=True)
    store.delete_post(post_id)
    store.add_activity(None, "deleted", f"Deleted “{post.get('title') or post['topic']}”")
    return {"ok": True}


@app.post("/api/posts/{post_id}/generate")
def generate(post_id: int) -> dict[str, bool]:
    post = require_post(post_id)
    if post["status"] in ("queued", "generating"):
        return {"ok": True}
    require_keys(settings.AI_KEYS, "AI writing")
    store.update_post(post_id, status="queued", stage=None, error=None)
    verb = "Rewriting" if post.get("article") else "Writing"
    store.add_activity(post_id, "queued", f"{verb} “{post.get('title') or post['topic']}”")
    worker.wake()
    return {"ok": True}


@app.post("/api/generate-all-ideas")
def generate_all_ideas() -> dict[str, int]:
    require_keys(settings.AI_KEYS, "AI writing")
    ideas = [p for p in store.list_posts() if p["status"] == "idea"]
    for post in ideas:
        store.update_post(post["id"], status="queued")
    if ideas:
        store.add_activity(None, "queued", f"Started writing {len(ideas)} posts")
        worker.wake()
    return {"queued": len(ideas)}


@app.post("/api/posts/{post_id}/image")
def new_image(post_id: int, body: ImageRequest) -> dict[str, Any]:
    post = require_post(post_id)
    config = require_keys(("POLLINATIONS_API_KEY",), "Image generation")
    title = post.get("title") or post["topic"]
    prompt = (body.prompt or "").strip() or None
    image = main.fetch_featured_image(config, post["topic"], title, prompt)
    if not image.data:
        raise HTTPException(502, "Pollinations didn't return an image. Check your key in Settings or try again.")
    old_file = post.get("image_file")
    store.update_post(post_id, image_prompt=prompt, **save_image(post_id, image))
    if old_file:
        (store.IMAGES_DIR / old_file).unlink(missing_ok=True)
    return post_view(require_post(post_id))


@app.post("/api/posts/{post_id}/publish")
def publish(post_id: int, body: PublishRequest) -> dict[str, Any]:
    post = require_post(post_id)
    if not post.get("article"):
        raise HTTPException(400, "This post has no article yet. Write it first.")
    config = require_keys(settings.WP_KEYS, "WordPress")

    status = {"publish": "publish", "schedule": "future", "draft": "draft"}[body.mode]
    if body.mode == "schedule":
        try:
            when = datetime.fromisoformat(body.date_gmt or "").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "Pick a date and time to schedule the post.")
        if when <= datetime.now(timezone.utc):
            raise HTTPException(400, "Pick a time in the future.")

    title = (post.get("title") or post["topic"]).strip()
    wp = main.WordPressClient(config.wp_url, config.wp_user, config.wp_app_pass)
    try:
        media_id = post.get("wp_media_id")
        image_path = store.IMAGES_DIR / post["image_file"] if post.get("image_file") else None
        if not media_id and image_path and image_path.exists():
            image = main.FeaturedImage(
                url=post.get("image_url") or "",
                alt_text=title,
                data=image_path.read_bytes(),
                content_type=post.get("image_type") or "image/jpeg",
            )
            try:
                media_id = wp.upload_image(image, main.slugify(title))
                store.update_post(post_id, wp_media_id=media_id)
            except main.PipelineError as exc:
                log.warning("Image upload failed, embedding the image URL instead: %s", exc)

        image = main.FeaturedImage(url=post.get("image_url") or "", alt_text=title)
        html = main.build_post_html(
            main.remove_first_h1(post["article"]), image, inline_image=media_id is None and bool(image.url)
        )
        result = wp.create_post(
            title,
            html,
            status,
            post.get("meta_description") or "",
            media_id,
            post_id=post.get("wp_post_id"),
            date_gmt=body.date_gmt if body.mode == "schedule" else None,
        )
    except main.PipelineError as exc:
        raise HTTPException(502, str(exc))

    fields: dict[str, Any] = {
        "wp_post_id": result.get("id"),
        "wp_link": result.get("link"),
        "wp_status": result.get("status"),
    }
    if body.mode == "publish":
        fields.update(status="published", published_at=store.now(), scheduled_at=None)
        store.add_activity(post_id, "published", f"Published “{title}”")
    elif body.mode == "schedule":
        scheduled = (result.get("date_gmt") or body.date_gmt or "").replace("Z", "")
        fields.update(status="scheduled", scheduled_at=f"{scheduled}+00:00")
        store.add_activity(post_id, "scheduled", f"Scheduled “{title}”")
    else:
        fields.update(status="review")
        store.add_activity(post_id, "draft", f"Saved “{title}” as a WordPress draft")
    store.update_post(post_id, **fields)
    return post_view(require_post(post_id))


@app.post("/api/preview")
def preview(body: PreviewRequest) -> dict[str, Any]:
    article = main.remove_first_h1(body.article)
    return {
        "html": main.markdown_to_html(article),
        "seo": seo.report(body.title, body.meta_description, article, body.keyword, body.has_image),
    }


@app.post("/api/suggest")
def suggest(body: SuggestRequest) -> dict[str, list[str]]:
    config = require_keys(("GROQ_API_KEY",), "Topic suggestions")
    prompt = (
        f'Suggest {body.count} specific, search-friendly blog post topics for a blog about "{body.niche}". '
        "Mix how-to guides, list posts and beginner explainers that target realistic long-tail keywords. "
        "Each topic should be a short phrase, not a full title. "
        'Reply as JSON: {"topics": ["...", "..."]}'
    )
    try:
        response = Groq(api_key=config.groq_api_key).chat.completions.create(
            model=config.groq_model,
            messages=[
                {"role": "system", "content": "You are an SEO content strategist. Reply with JSON only."},
                {"role": "user", "content": main.with_guidance(prompt, config.writing_guidance)},
            ],
            response_format={"type": "json_object"},
            temperature=0.9,
        )
        topics = json.loads(response.choices[0].message.content or "{}").get("topics", [])
    except GroqError as exc:
        raise HTTPException(502, f"Groq couldn't suggest topics: {exc}")
    except (ValueError, AttributeError):
        raise HTTPException(502, "Groq returned an unexpected answer. Try again.")
    return {"topics": [str(t).strip() for t in topics if str(t).strip()][: body.count]}


# --------------------------------------------------------------------------- #
# Settings + connection tests
# --------------------------------------------------------------------------- #
@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return {"fields": settings.public_view(), "setup": setup_state()}


@app.put("/api/settings")
def put_settings(body: dict[str, str]) -> dict[str, Any]:
    settings.save(body)
    for name in list(service_status):
        service_status.pop(name)  # old results may no longer apply
    return get_settings()


def _result(level: str, message: str) -> dict[str, str]:
    return {"level": level, "message": message, "checked_at": store.now()}


def test_service(name: str) -> dict[str, str]:
    config = settings.load_config()
    try:
        if name == "groq":
            if not config.groq_api_key:
                return _result("off", "Add your Groq key")
            models = {m.id for m in Groq(api_key=config.groq_api_key).models.list().data}
            if config.groq_model not in models:
                return _result("warn", f"Key works, but model {config.groq_model} isn't available")
            return _result("ok", f"Connected · {config.groq_model}")

        if name == "gemini":
            if not config.gemini_api_key:
                return _result("off", "Add your Gemini key")
            # Keep a reference: an unreferenced Client is garbage-collected and closes its connection mid-call.
            client = genai.Client(
                api_key=config.gemini_api_key, http_options=genai_types.HttpOptions(timeout=20_000)
            )
            try:
                client.models.get(model=config.gemini_model)  # fast: checks the key and model name
                # A tiny request also catches models that exist but are retired for new keys.
                client.models.generate_content(
                    model=config.gemini_model,
                    contents="Reply with OK",
                    config=genai_types.GenerateContentConfig(max_output_tokens=64),
                )
            except genai_errors.APIError as exc:
                if exc.code == 404:
                    return _result("error", f"Model {config.gemini_model} isn't available for your key; pick another in Settings")
                if exc.code in (429, 500, 503, 504):
                    return _result("warn", "Key works, but Gemini is busy right now (posts retry automatically)")
                return _result("error", f"Key rejected ({exc.code})")
            except httpx.TimeoutException:
                return _result("warn", "Key works, but Gemini is slow right now (posts retry automatically)")
            return _result("ok", f"Connected · {config.gemini_model}")

        if name == "pollinations":
            if not config.pollinations_api_key:
                return _result("off", "Add your Pollinations key")
            url = f"{config.pollinations_base_url}/{quote('a small blue circle')}?width=64&height=64&nologo=true"
            response = requests.get(
                url, headers={"Authorization": f"Bearer {config.pollinations_api_key}"}, timeout=90
            )
            if response.status_code in (401, 403):
                return _result("error", "Key rejected")
            response.raise_for_status()
            if not response.headers.get("Content-Type", "").startswith("image/"):
                return _result("warn", "Connected, but no image came back")
            return _result("ok", "Connected")

        if name == "wordpress":
            if settings.missing(settings.WP_KEYS):
                return _result("off", "Add your site details")
            user = main.WordPressClient(config.wp_url, config.wp_user, config.wp_app_pass).current_user()
            capabilities = user.get("capabilities") or {}
            if capabilities and not capabilities.get("publish_posts"):
                return _result("warn", f"Connected as {user.get('name')}, but this user can't publish posts")
            return _result("ok", f"Connected as {user.get('name', config.wp_user)}")
    except GroqError as exc:
        return _result("error", f"Groq: {exc}")
    except main.PipelineError as exc:
        return _result("error", str(exc))
    except requests.RequestException as exc:
        return _result("error", f"Couldn't connect: {main.describe_http_error(exc)}")
    except Exception as exc:  # a connection test should report problems, never crash
        log.exception("Connection test for %s failed", name)
        return _result("error", f"Couldn't connect: {exc}")
    raise HTTPException(404, "Unknown service")


@app.post("/api/test/{name}")
def test_one(name: str) -> dict[str, str]:
    if name not in SERVICES:
        raise HTTPException(404, "Unknown service")
    service_status[name] = test_service(name)
    return service_status[name]


@app.post("/api/test")
def test_all() -> dict[str, dict[str, str]]:
    threads = [threading.Thread(target=test_one, args=(name,)) for name in SERVICES]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return service_status


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def run() -> None:
    parser = argparse.ArgumentParser(description="Start the Autoblog dashboard.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="Don't open the browser automatically")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s", datefmt="%H:%M:%S")
    for noisy in ("httpx", "httpcore", "urllib3", "google_genai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    url = f"http://127.0.0.1:{args.port}"
    print(f"\n  Autoblog is running at {url}\n  Press Ctrl+C to stop.\n")
    if not args.no_browser:
        threading.Timer(1.2, webbrowser.open, args=(url,)).start()
    # Bound to localhost only: the dashboard can read your keys and post to your site.
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    run()
