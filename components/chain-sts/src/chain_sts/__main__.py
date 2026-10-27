"""Entry point: ``python -m chain_sts``. The configuration file is CHAIN_STS_CONFIG."""

from __future__ import annotations

import logging
import sys

import uvicorn

from .app import create_app
from .config import ConfigError, load_config, load_settings
from .logs import setup_logging


def main() -> None:
    try:
        settings = load_settings()
    except ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(2)
    setup_logging(settings.log_level)
    try:
        config = load_config(settings.config_file)
        app = create_app(config, app_version=settings.app_version, environment=settings.environment)
    except ConfigError as exc:
        logging.getLogger("chain_sts").error("configuration error: %s", exc)
        sys.exit(2)
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        # Uvicorn's own lines go through the JSON handler too.
        log_config=None,
        log_level=settings.log_level.lower(),
        access_log=False,
    )


if __name__ == "__main__":
    main()
