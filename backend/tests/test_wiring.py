"""Checks that need no database — the ones that catch boot failures.

The integration tests skip when PostGIS is unreachable, which means a route
that FastAPI refuses to register (or a response model it cannot express) sails
through CI and only explodes on `docker compose up`. Everything here runs
against the app object alone.
"""
from __future__ import annotations

import inspect

import pytest
from fastapi.routing import APIRoute

from app.main import app
from app.services.compliance import is_hazardous
from app.services.spray import dose_from_water


def test_app_imports_and_registers_routes():
    """Importing `app.main` is what fails when a route is malformed."""
    routes = [r for r in app.routes if isinstance(r, APIRoute)]
    assert len(routes) > 40


def test_openapi_schema_generates():
    """Exercises every response model attached to every route."""
    schema = app.openapi()
    assert schema["paths"]
    for name in ("ScoutMovement", "MovementDay", "MovementStop", "AgentTrendPoint"):
        assert name in schema["components"]["schemas"]


def test_no_path_param_shadows_a_dependency_query_param():
    """A path param may not share a name with a query param on the same route.

    FastAPI asserts at import time — `Cannot use Query for path param` — and
    the whole application fails to start. It is an easy mistake to make when a
    shared filter dependency happens to expose a field like `scout_id` and a
    new endpoint wants that same name in its path.
    """
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        path_params = set(route.param_convertors)
        query_names = {p.name for p in route.dependant.query_params}
        for dep in route.dependant.dependencies:
            query_names |= {p.name for p in dep.query_params}
        clash = path_params & query_names
        assert not clash, f"{route.path}: {clash} is both a path and query param"


@pytest.mark.parametrize(
    ("volume", "rate", "expected"),
    [
        (1000, 50, 0.5),
        (1000, 35, 0.35),
        (800, 50, 0.4),
        (1500, 100, 1.5),
        (1200, 80, 0.96),
    ],
)
def test_dose_from_water(volume, rate, expected):
    """`rate` is product per 100 L — the FloriSynergy spray-sheet convention."""
    assert dose_from_water(volume, rate) == expected
    # Cross-check against the app's own formula, (volume / (100 / rate)) / 1000.
    assert dose_from_water(volume, rate) == round((volume / (100 / rate)) / 1000, 3)


@pytest.mark.parametrize(
    ("volume", "rate"),
    [(0, 50), (1000, 0), (None, 50), (1000, None), (-100, 50)],
)
def test_dose_from_water_rejects_nonsense(volume, rate):
    assert dose_from_water(volume, rate) is None


@pytest.mark.parametrize("cls", ["Ia", "IA", "ib", "II", "1a", " ii "])
def test_hazard_classes_are_case_insensitive(cls):
    assert is_hazardous(cls)


@pytest.mark.parametrize("cls", ["III", "U", "", None])
def test_non_hazard_classes(cls):
    assert not is_hazardous(cls)


def test_compose_spray_signature_accepts_sheet_fields():
    """The program builder posts these; a rename here breaks it silently."""
    params = inspect.signature(
        __import__("app.services.spray", fromlist=["compose_spray"]).compose_spray
    ).parameters
    for name in (
        "volume_of_water_l",
        "rate",
        "partition_no",
        "type_of_application",
        "rei",
        "scout_report_date",
        "start_time",
    ):
        assert name in params, f"compose_spray lost `{name}`"
