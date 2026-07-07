"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";
import {
  CircleMarker,
  LayersControl,
  MapContainer,
  Polygon,
  Polyline,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { PRESSURE_HEX } from "@/lib/format";
import type { Coordinate, Greenhouse, GreenhousePressure } from "@/lib/types";

const FARM_CENTER: [number, number] = [-0.82454, 36.32721];
const DEFAULT_ZOOM = 17;

function toLatLng(coords: Coordinate[]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

/** Switchable basemaps: satellite bird-view + flat 2D street/light maps. */
function BaseMaps() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Satellite">
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri — Maxar, Earthstar Geographics"
          maxNativeZoom={18}
          maxZoom={21}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Streets">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Light 2D">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
          maxZoom={20}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}

function FitBounds({ polygons, signature }: { polygons: [number, number][][]; signature: string }) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!polygons.length || fitted.current === signature) return;
    const bounds = L.latLngBounds(polygons.flat());
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
      fitted.current = signature;
    }
  }, [map, polygons, signature]);
  return null;
}

/** Observation density heat layer (leaflet.heat), weighted by severity.
 *
 * leaflet.heat references a global `L`, which webpack doesn't provide — so we
 * expose it on window and load the plugin dynamically before use. */
function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    let layer: L.Layer | undefined;
    let cancelled = false;
    (async () => {
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.heat");
      if (cancelled) return;
      layer = (L as unknown as {
        heatLayer: (pts: [number, number, number][], opts: object) => L.Layer;
      }).heatLayer(points, {
        radius: 24,
        blur: 18,
        max: 1,
        minOpacity: 0.35,
        gradient: { 0.2: "#22c55e", 0.45: "#eab308", 0.65: "#f97316", 0.85: "#ef4444", 1: "#b91c1c" },
      });
      layer.addTo(map);
    })();
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

function ClickCapture({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}
function MoveCapture({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ mousemove: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

// ── Pressure heatmap ──
export function PressureMap({
  data,
  selectedId,
  onSelect,
  showLabels = true,
  heatPoints,
  showHeat = false,
  showChoropleth = true,
}: {
  data: GreenhousePressure[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  showLabels?: boolean;
  heatPoints?: [number, number, number][];
  showHeat?: boolean;
  showChoropleth?: boolean;
}) {
  const polygons = data.map((g) => toLatLng(g.boundary));
  const signature = data.map((g) => g.greenhouse_id).join(",");

  return (
    <MapContainer center={FARM_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" zoomControl>
      <BaseMaps />
      <ScaleControl position="bottomleft" />
      <FitBounds polygons={polygons} signature={signature} />
      {showHeat && heatPoints && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
      {showChoropleth && data.map((g) => {
        const selected = g.greenhouse_id === selectedId;
        const baseWeight = selected ? 4 : 1.5;
        const baseOpacity = selected ? 0.8 : showHeat ? 0.1 : 0.66;
        const label = g.name.replace(/[^0-9]/g, "") || g.name.slice(0, 2);
        return (
          <Polygon
            key={g.greenhouse_id}
            positions={toLatLng(g.boundary)}
            pathOptions={{
              color: selected ? "#ffffff" : "#0f172a",
              weight: baseWeight,
              fillColor: PRESSURE_HEX[g.pressure],
              fillOpacity: baseOpacity,
            }}
            eventHandlers={{
              click: () => onSelect(g.greenhouse_id),
              mouseover: (e) => e.target.setStyle({ weight: 3, fillOpacity: 0.88 }),
              mouseout: (e) => e.target.setStyle({ weight: baseWeight, fillOpacity: baseOpacity }),
            }}
          >
            {showLabels && (
              <Tooltip permanent direction="center" className="gh-label">
                {label}
              </Tooltip>
            )}
          </Polygon>
        );
      })}
    </MapContainer>
  );
}

// ── Mapping (draw) ──
export function MappingMap({
  greenhouses,
  draft,
  preview,
  onMapClick,
  onMouseMove,
}: {
  greenhouses: Greenhouse[];
  draft: Coordinate[];
  preview: Coordinate[] | null;
  onMapClick: (lat: number, lng: number) => void;
  onMouseMove: (lat: number, lng: number) => void;
}) {
  const existing = greenhouses.map((g) => toLatLng(g.boundary));
  const draftLatLng = toLatLng(draft);
  const previewLatLng = preview ? toLatLng(preview) : null;
  const signature = greenhouses.map((g) => g.id).join(",");
  return (
    <MapContainer center={FARM_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" zoomControl>
      <BaseMaps />
      <ScaleControl position="bottomleft" />
      <FitBounds polygons={existing} signature={signature} />
      <ClickCapture onClick={onMapClick} />
      <MoveCapture onMove={onMouseMove} />
      {greenhouses.map((g) => (
        <Polygon
          key={g.id}
          positions={toLatLng(g.boundary)}
          pathOptions={{ color: "#0f172a", weight: 1.5, fillColor: "#64748b", fillOpacity: 0.22 }}
        >
          <Tooltip direction="top" sticky>
            {g.name}
          </Tooltip>
        </Polygon>
      ))}
      {previewLatLng && previewLatLng.length >= 3 && (
        <Polygon
          positions={previewLatLng}
          pathOptions={{ color: "#10b981", weight: 2, dashArray: "6", fillColor: "#10b981", fillOpacity: 0.25 }}
        />
      )}
      {draftLatLng.length >= 3 ? (
        <Polygon positions={draftLatLng} pathOptions={{ color: "#059669", weight: 3, fillColor: "#10b981", fillOpacity: 0.4 }} />
      ) : draftLatLng.length === 2 ? (
        <Polyline positions={draftLatLng} pathOptions={{ color: "#059669", weight: 3 }} />
      ) : null}
      {draftLatLng.map((pos, i) => (
        <CircleMarker key={i} center={pos} radius={6} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#059669", fillOpacity: 1 }} />
      ))}
    </MapContainer>
  );
}
