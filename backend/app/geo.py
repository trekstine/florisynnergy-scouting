"""Geometry helpers — GeoJSON-ish coordinate lists ↔ PostGIS, point-in-polygon.

Scouts capture at bed precision; the mobile app does the authoritative offline
point-in-polygon check, and the backend mirrors it with Shapely for write
validation and server-side cross-checks.
"""
from __future__ import annotations

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point, Polygon

Coordinate = tuple[float, float]  # [lng, lat]


def coords_to_geometry(coords: list[Coordinate]):
    ring = [(float(lng), float(lat)) for lng, lat in coords]
    if len(ring) < 3:
        raise ValueError("A polygon boundary needs at least 3 vertices.")
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    polygon = Polygon(ring)
    if not polygon.is_valid:
        raise ValueError("Boundary vertices form an invalid polygon.")
    return from_shape(polygon, srid=4326)


def geometry_to_coords(geom) -> list[list[float]]:
    polygon = to_shape(geom)
    coords = [[float(x), float(y)] for x, y in polygon.exterior.coords]
    if len(coords) > 1 and coords[0] == coords[-1]:
        coords = coords[:-1]
    return coords


def centroid(coords: list[Coordinate]) -> list[float]:
    """Return [lng, lat] centroid of a ring (for bed labels / heatmap points)."""
    poly = Polygon([(float(x), float(y)) for x, y in coords])
    c = poly.centroid
    return [float(c.x), float(c.y)]


def point_in_polygon(lat: float, lng: float, coords: list[Coordinate]) -> bool:
    ring = [(float(x), float(y)) for x, y in coords]
    if len(ring) < 3:
        return False
    return Polygon(ring).covers(Point(float(lng), float(lat)))
