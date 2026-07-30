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


def test_only_llm_module_resolves_model_environment() -> None:
    forbidden = ("LLM_MODEL", "LLM_MODEL_PROD", "LLM_MODEL_CI")
    offenders = []
    for path in (ROOT / "backend").glob("*.py"):
        if path.name == "llm.py":
            continue
        text = path.read_text(encoding="utf-8")
        if any(token in text for token in forbidden):
            offenders.append(path.name)
    assert offenders == []


def test_resolver_is_sync_and_model_free() -> None:
    text = (ROOT / "backend" / "resolve.py").read_text(encoding="utf-8")
    assert "import llm" not in text
    assert "await " not in text


def test_supabase_auth_boundary_is_backend_only() -> None:
    auth_text = (ROOT / "backend" / "auth.py").read_text(encoding="utf-8")
    main_text = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")

    assert "PyJWKClient" in auth_text
    assert 'algorithms=JWT_ALGORITHMS' in auth_text
    assert 'audience=JWT_AUDIENCE' in auth_text
    assert "issuer=settings.issuer" in auth_text
    assert main_text.count("Depends(require_authenticated_user)") == 3
    assert '@app.api_route("/api/health", methods=["GET", "HEAD"])' in main_text

    forbidden_frontend_secrets = (
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "VITE_SUPABASE_SERVICE_ROLE_KEY",
        "VITE_SUPABASE_SECRET_KEY",
    )
    frontend_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "frontend" / "src").rglob("*")
        if path.is_file() and path.suffix in {".js", ".jsx", ".css"}
    )
    assert not any(secret in frontend_text for secret in forbidden_frontend_secrets)


def test_no_persistence_implementation() -> None:
    forbidden = (
        "localStorage",
        "sessionStorage",
        "sqlite",
        "sqlalchemy",
        "mongodb",
        "firebase",
    )
    offenders = []
    for directory in (ROOT / "backend", ROOT / "frontend" / "src"):
        for path in directory.rglob("*"):
            if (
                not path.is_file()
                or path.suffix not in {".py", ".js", ".jsx", ".css"}
            ):
                continue
            text = path.read_text(encoding="utf-8")
            if any(token.lower() in text.lower() for token in forbidden):
                offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_footer_contract_is_present() -> None:
    disclosure = (
        "Formative guidance only. Not a grade. This signed-in session stores source"
    )
    for name in ("App.jsx", "HistoryView.jsx"):
        text = (ROOT / "frontend" / "src" / name).read_text(encoding="utf-8")
        assert disclosure in text
        assert "successful explanation attempts." in text


def test_persistence_is_owner_scoped_by_row_level_security() -> None:
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    assert migrations
    text = "\n".join(path.read_text(encoding="utf-8") for path in migrations)

    for table in ("public.sessions", "public.explanation_attempts"):
        assert f"alter table {table} enable row level security;" in text
        assert f"revoke all on table {table} from anon, authenticated;" in text
        assert f"grant select, insert on table {table} to authenticated;" in text

    assert "(select auth.uid()) = user_id" in text
    assert "sessions.user_id = (select auth.uid())" in text
    assert "for update" not in text
    assert "for delete" not in text
    assert "service_role" not in text
