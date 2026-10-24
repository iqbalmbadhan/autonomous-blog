"""Read and write the dashboard's settings, which live in the same .env file the CLI uses."""

from __future__ import annotations

import re
from pathlib import Path

from dotenv import dotenv_values, set_key

import main

ENV_PATH = Path(__file__).resolve().parent / ".env"

# name -> is it a secret? Secrets are never sent back to the browser.
FIELDS: dict[str, bool] = {
    "GROQ_API_KEY": True,
    "GEMINI_API_KEY": True,
    "POLLINATIONS_API_KEY": True,
    "WP_URL": False,
    "WP_USER": False,
    "WP_APP_PASS": True,
    "GROQ_MODEL": False,
    "GEMINI_MODEL": False,
    "BLOG_AUDIENCE": False,
    "BLOG_TONE": False,
}
AI_KEYS = ("GROQ_API_KEY", "GEMINI_API_KEY", "POLLINATIONS_API_KEY")
WP_KEYS = ("WP_URL", "WP_USER", "WP_APP_PASS")


def read() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    return {name: value or "" for name, value in dotenv_values(ENV_PATH).items()}


def load_config() -> main.Config:
    return main.config_from_mapping(read())


def missing(names: tuple[str, ...]) -> list[str]:
    values = read()
    return [name for name in names if not values.get(name, "").strip()]


def public_view() -> dict[str, dict[str, object]]:
    values = read()
    view: dict[str, dict[str, object]] = {}
    for name, secret in FIELDS.items():
        value = values.get(name, "").strip()
        if secret:
            view[name] = {"set": bool(value), "hint": f"••••{value[-4:]}" if len(value) > 8 else ""}
        else:
            view[name] = {"set": bool(value), "value": value}
    view["GROQ_MODEL"]["default"] = main.DEFAULT_GROQ_MODEL
    view["GEMINI_MODEL"]["default"] = main.DEFAULT_GEMINI_MODEL
    return view


def normalize_wp_url(url: str) -> str:
    """Accept a plain site address and turn it into the posts endpoint."""
    url = url.strip().rstrip("/")
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = f"https://{url}"
    if "/wp-json" not in url:
        url = f"{url}/wp-json/wp/v2/posts"
    return url


def save(updates: dict[str, str]) -> None:
    ENV_PATH.touch(exist_ok=True)
    for name, value in updates.items():
        if name not in FIELDS or value is None:
            continue
        value = " ".join(str(value).split()) if name != "WP_APP_PASS" else str(value).strip()
        if FIELDS[name] and not value:
            continue  # blank secret field means "keep the current value"
        if name == "WP_URL":
            value = normalize_wp_url(value)
        set_key(str(ENV_PATH), name, value)
