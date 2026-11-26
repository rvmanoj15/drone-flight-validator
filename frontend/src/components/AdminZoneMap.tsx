import { useMemo, useState } from 'react';
import L from 'leaflet';
import { circle as turfCircle } from '@turf/turf';
import {
  GeoJSON,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { Layers, Maximize2 } from 'lucide-react';
import { AirspaceZoneFeature, LngLat, RestrictionLevel } from '../types';

export type AdminDrawTool = 'POLYGON' | 'BOX' | 'CIRCLE' | 'SELECT';

interface AdminZoneMapProps {
  zones: AirspaceZoneFeature[];
  draftVertices: LngLat[];
  selectedColor: RestrictionLevel;
  drawTool: AdminDrawTool;
  circleRadiusMeters: number;
  selectedZoneId: string | null;
  onChangeDraftVertices: (vertices: LngLat[]) => void;
  onSelectZone: (zone: AirspaceZoneFeature) => void;
}

const ZONE_STYLE: Record<
  RestrictionLevel,
  { color: string; fillColor: string; fillOpacity: number; weight: number }
> = {
  RED: { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.28, weight: 2 },
  YELLOW: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.24, weight: 2 },
  GREEN: { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.18, weight: 1.8 },
};

function createVertexIcon(index: number, colorHex: string) {
  return L.divIcon({
    className: 'tenorix-marker',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:22px;height:22px;border-radius:9999px;
      background:${colorHex};border:2px solid #ffffff;
      color:#050a14;font-weight:800;font-size:10px;
      box-shadow:0 3px 8px rgba(0,0,0,0.45);
    ">${index + 1}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function AdminMapClickHandler({
  drawTool,
  draftVertices,
  circleRadiusMeters,
  onChangeDraftVertices,
}: {
  drawTool: AdminDrawTool;
  draftVertices: LngLat[];
  circleRadiusMeters: number;
  onChangeDraftVertices: (vertices: LngLat[]) => void;
}) {
  useMapEvents({
    click(e) {
      if (drawTool === 'SELECT') return;
      const clicked: LngLat = [
        Number(e.latlng.lng.toFixed(6)),
        Number(e.latlng.lat.toFixed(6)),
      ];

      if (drawTool === 'POLYGON') {
        onChangeDraftVertices([...draftVertices, clicked]);
        return;
      }

      if (drawTool === 'BOX') {
        // 1st click sets anchor corner, 2nd click creates 4-corner rectangle
        if (draftVertices.length !== 1) {
          onChangeDraftVertices([clicked]);
        } else {
          const [lng1, lat1] = draftVertices[0];
          const [lng2, lat2] = clicked;
          const minLng = Math.min(lng1, lng2);
          const maxLng = Math.max(lng1, lng2);
          const minLat = Math.min(lat1, lat2);
          const maxLat = Math.max(lat1, lat2);
          if (maxLng - minLng < 0.0001 || maxLat - minLat < 0.0001) return;
          onChangeDraftVertices([
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
          ]);
        }
        return;
      }

      if (drawTool === 'CIRCLE') {
        const poly = turfCircle(clicked, circleRadiusMeters / 1000, {
          steps: 24,
          units: 'kilometers',
        });
        const ring = (poly.geometry.coordinates[0] as number[][])
          .slice(0, -1)
          .map((c) => [Number(c[0].toFixed(6)), Number(c[1].toFixed(6))] as LngLat);
        onChangeDraftVertices(ring);
      }
    },
  });

  return null;
}

function FitAirspaceBtn({ zones }: { zones: AirspaceZoneFeature[] }) {
  const map = useMap();

  const handleFit = () => {
    const pts: L.LatLngExpression[] = [];
    for (const z of zones) {
      if (z.geometry.type === 'Polygon') {
        for (const pt of z.geometry.coordinates[0] as number[][]) {
          pts.push([pt[1], pt[0]]);
        }
      }
    }
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts).pad(0.12));
    } else {
      map.setView([36.85, -121.595], 13);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleFit();
      }}
      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-navy-900/95 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-md hover:border-cyan-500/50 hover:text-cyan-300 transition"
    >
      <Maximize2 className="h-3.5 w-3.5" />
      Fit Airspace
    </button>
  );
}

export function AdminZoneMap({
  zones,
  draftVertices,
  selectedColor,
  drawTool,
  circleRadiusMeters,
  selectedZoneId,
  onChangeDraftVertices,
  onSelectZone,
}: AdminZoneMapProps) {
  const [tileLayer, setTileLayer] = useState<'osm' | 'dark'>('osm');

  const draftColorHex = ZONE_STYLE[selectedColor].color;
  const draftLatLngs = useMemo<L.LatLngExpression[]>(
    () => draftVertices.map((c) => [c[1], c[0]]),
    [draftVertices]
  );

  const zonesKey = useMemo(
    () =>
      zones
        .map(
          (z) =>
            `${z.properties.id}:${z.properties.restrictionLevel}:${z.properties.lastUpdated}:${
              selectedZoneId === z.properties.id ? 'sel' : ''
            }`
        )
        .join('|'),
    [zones, selectedZoneId]
  );

  const handleDragVertex = (index: number, e: L.DragEndEvent) => {
    const pos = e.target.getLatLng();
    const updated = [...draftVertices];
    updated[index] = [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))];
    onChangeDraftVertices(updated);
  };

  const handleRemoveVertex = (index: number) => {
    onChangeDraftVertices(draftVertices.filter((_, i) => i !== index));
  };

  return (
    <div className="relative h-[540px] w-full overflow-hidden rounded-2xl border border-slate-700/80 bg-navy-900 shadow-xl">
      <MapContainer
        center={[36.85, -121.595]}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom
      >
        {tileLayer === 'osm' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; OpenStreetMap &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        )}

        <AdminMapClickHandler
          drawTool={drawTool}
          draftVertices={draftVertices}
          circleRadiusMeters={circleRadiusMeters}
          onChangeDraftVertices={onChangeDraftVertices}
        />

        {/* Existing Saved Zones (hidden when currently being reshaped as draft) */}
        {zones.length > 0 && (
          <GeoJSON
            key={zonesKey}
            data={{
              type: 'FeatureCollection',
              features: zones.filter((z) => z.properties.id !== selectedZoneId || draftVertices.length === 0),
            } as GeoJSON.GeoJsonObject}
            style={(feature) => {
              const level = (feature?.properties?.restrictionLevel as RestrictionLevel) || 'GREEN';
              const isSelected = feature?.properties?.id === selectedZoneId;
              return {
                ...ZONE_STYLE[level],
                weight: isSelected ? 3.5 : ZONE_STYLE[level].weight,
                dashArray: isSelected ? '6 4' : undefined,
              };
            }}
            onEachFeature={(feature, layer) => {
              const p = feature.properties;
              if (!p) return;
              layer.bindTooltip(
                `<div style="font-size:12px;">
                  <strong>${p.id}: ${p.name}</strong> (${p.restrictionLevel})<br/>
                  <span>Click zone to edit or delete</span>
                </div>`,
                { sticky: true }
              );
              layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                const fullFeature = zones.find((z) => z.properties.id === p.id);
                if (fullFeature) {
                  onSelectZone(fullFeature);
                }
              });
            }}
          />
        )}

        {/* Live Draft Shape Preview */}
        {draftLatLngs.length >= 3 && (
          <Polygon
            positions={draftLatLngs}
            pathOptions={{
              color: draftColorHex,
              fillColor: draftColorHex,
              fillOpacity: 0.36,
              weight: 3,
              dashArray: '6 5',
            }}
          />
        )}

        {draftLatLngs.length === 2 && (
          <Polyline
            positions={draftLatLngs}
            pathOptions={{
              color: draftColorHex,
              weight: 3,
              dashArray: '6 5',
            }}
          />
        )}

        {/* Draggable Vertex Handles (skip rendering 24 dense dots for Circle unless user wants) */}
        {draftVertices.length <= 12 &&
          draftVertices.map((pt, idx) => (
            <Marker
              key={`v-${idx}-${pt[0]}-${pt[1]}`}
              position={[pt[1], pt[0]]}
              icon={createVertexIcon(idx, draftColorHex)}
              draggable
              eventHandlers={{
                dragend: (e) => handleDragVertex(idx, e),
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (drawTool === 'POLYGON') {
                    handleRemoveVertex(idx);
                  }
                },
              }}
            >
              <Tooltip direction="top">
                Vertex #{idx + 1} (Drag to reshape{drawTool === 'POLYGON' ? ', click to remove' : ''})
              </Tooltip>
            </Marker>
          ))}

        {/* Top-Right Basemap Controls */}
        <div className="leaflet-top leaflet-right pointer-events-auto m-3 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTileLayer((prev) => (prev === 'osm' ? 'dark' : 'osm'));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-navy-900/95 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-md hover:border-cyan-500/50 hover:text-cyan-300 transition"
          >
            <Layers className="h-3.5 w-3.5" />
            {tileLayer === 'osm' ? 'OSM Streets' : 'Dark GIS'}
          </button>
          <FitAirspaceBtn zones={zones} />
        </div>
      </MapContainer>

      {/* Bottom Hint Bar */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl border border-slate-700/80 bg-navy-950/90 px-3 py-2 text-[11px] text-slate-200 backdrop-blur-md shadow-lg">
        {drawTool === 'POLYGON' && 'Click map to add corners (3+ points). Drag markers to adjust shape.'}
        {drawTool === 'BOX' &&
          (draftVertices.length === 1
            ? 'Click the opposite corner on the map to finish the box.'
            : 'Click first corner on the map to draw a box zone.')}
        {drawTool === 'CIRCLE' &&
          `Click center point on the map to place a ${circleRadiusMeters} m circular zone.`}
        {drawTool === 'SELECT' && 'Click any existing colored zone on the map to edit or delete it.'}
      </div>
    </div>
  );
}
