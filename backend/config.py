import os


def _float_env(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    return float(value) if value else default


EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
T_HIGH = _float_env("T_HIGH", 0.732)
T_LOW = _float_env("T_LOW", 0.680)
MAX_SOURCE_CHARS = 6000
MAX_EXPLANATION_CHARS = 4000
MIN_SOURCE_CHARS = 100
MIN_EXPLANATION_CHARS = 40
