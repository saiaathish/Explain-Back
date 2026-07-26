from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_only_llm_module_names_outbound_clients() -> None:
    forbidden = ("requests", "httpx", "fetch", "aiohttp")
    offenders = []
    for path in (ROOT / "backend").glob("*.py"):
        text = path.read_text(encoding="utf-8")
        if any(token in text for token in forbidden) and path.name != "llm.py":
            offenders.append(path.name)
    assert offenders == []
    assert "httpx" in (ROOT / "backend" / "llm.py").read_text(encoding="utf-8")


def test_resolver_is_sync_and_model_free() -> None:
    text = (ROOT / "backend" / "resolve.py").read_text(encoding="utf-8")
    assert "import llm" not in text
    assert "await " not in text


def test_no_persistence_or_auth_implementation() -> None:
    ignored = {"README.md", "test_invariants.py"}
    forbidden = (
        "localStorage",
        "sessionStorage",
        "sqlite",
        "sqlalchemy",
        "mongodb",
        "supabase",
        "firebase",
        "login",
        "signup",
    )
    offenders = []
    for directory in (ROOT / "backend", ROOT / "frontend" / "src"):
        for path in directory.rglob("*"):
            if (
                not path.is_file()
                or path.name in ignored
                or path.suffix not in {".py", ".js", ".jsx", ".css"}
            ):
                continue
            text = path.read_text(encoding="utf-8")
            if any(token.lower() in text.lower() for token in forbidden):
                offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_footer_contract_is_present() -> None:
    text = (ROOT / "frontend" / "src" / "App.jsx").read_text(encoding="utf-8")
    assert (
        "Formative guidance only. Not a grade. Explain-Back does not persist"
        in text
    )
