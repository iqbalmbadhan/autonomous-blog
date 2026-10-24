"""Background worker that writes queued posts one at a time."""

from __future__ import annotations

import logging
import threading
import time

from google import genai
from groq import Groq

import main
import settings
import store

log = logging.getLogger("blog-generator.worker")


class PostLogHandler(logging.Handler):
    """Copies pipeline log lines into the post currently being written."""

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.post_id: int | None = None

    def emit(self, record: logging.LogRecord) -> None:
        if self.post_id is None:
            return
        try:
            store.append_log(self.post_id, record.levelname.lower(), record.getMessage().strip())
        except Exception:  # never let logging break a run
            self.handleError(record)


def save_image(post_id: int, image: main.FeaturedImage) -> dict[str, object]:
    """Store a downloaded image and return the post fields that describe it."""
    fields: dict[str, object] = {"image_url": image.url, "image_file": None, "image_type": None, "wp_media_id": None}
    if image.data:
        extension = {"image/png": "png", "image/webp": "webp"}.get(image.content_type, "jpg")
        filename = f"post-{post_id}-{int(time.time())}.{extension}"
        (store.IMAGES_DIR / filename).write_bytes(image.data)
        fields.update(image_file=filename, image_type=image.content_type)
    return fields


class Worker:
    def __init__(self) -> None:
        self._wake = threading.Event()
        self._handler = PostLogHandler()
        main.log.addHandler(self._handler)
        main.log.setLevel(logging.INFO)

    def start(self) -> None:
        threading.Thread(target=self._loop, name="post-writer", daemon=True).start()

    def wake(self) -> None:
        self._wake.set()

    def _loop(self) -> None:
        while True:
            post_id = store.next_queued()
            if post_id is None:
                self._wake.wait(timeout=5)
                self._wake.clear()
                continue
            self._handler.post_id = post_id
            try:
                self._write(post_id)
            finally:
                self._handler.post_id = None

    def _write(self, post_id: int) -> None:
        post = store.get_post(post_id)
        if post is None:
            return
        topic = post["topic"]
        store.update_post(post_id, status="generating", stage="outline", error=None, log=[])
        try:
            missing = settings.missing(settings.AI_KEYS)
            if missing:
                raise main.PipelineError(f"Add these keys in Settings first: {', '.join(missing)}")
            config = settings.load_config()

            outline = main.generate_outline(
                Groq(api_key=config.groq_api_key), config.groq_model, topic, config.writing_guidance
            )
            store.update_post(
                post_id,
                outline=outline,
                keyword=main.extract_primary_keyword(outline) or topic,
                meta_description=main.extract_meta_description(outline),
                stage="article",
            )

            article = main.draft_article(
                genai.Client(api_key=config.gemini_api_key),
                config.gemini_model,
                topic,
                outline,
                config.writing_guidance,
            )
            title = main.extract_title(article, fallback=main.extract_title(outline, fallback=topic))
            store.update_post(post_id, article=article, title=title, stage="image")

            image = main.fetch_featured_image(config, topic, title)
            store.update_post(post_id, status="review", stage=None, **save_image(post_id, image))
            store.add_activity(post_id, "ready", f"“{title}” is ready for review")
            log.info("Post %s is ready for review.", post_id)
        except main.PipelineError as exc:
            self._fail(post_id, topic, str(exc))
        except Exception as exc:  # keep the worker alive whatever happens
            log.exception("Unexpected error while writing post %s", post_id)
            self._fail(post_id, topic, f"Unexpected error: {exc}")

    @staticmethod
    def _fail(post_id: int, topic: str, message: str) -> None:
        store.append_log(post_id, "error", message)
        store.update_post(post_id, status="failed", stage=None, error=message)
        store.add_activity(post_id, "failed", f"Couldn't write “{topic}”")
