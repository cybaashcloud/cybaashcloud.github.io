"""utils/logger.py — structured logging setup"""
import logging
import sys
import os


def setup_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logger.setLevel(getattr(logging, level, logging.INFO))

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(handler)

    # File handler
    log_path = os.getenv("LOG_FILE", "cyberbot.log")
    try:
        fh = logging.FileHandler(log_path)
        fh.setFormatter(handler.formatter)
        logger.addHandler(fh)
    except Exception:
        pass

    return logger
