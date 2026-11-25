import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import {
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { Layers, Maximize2 } from 'lucide-react';
import { AirspaceZoneFeature, LngLat, RestrictionLevel } from '../types';

export type DrawMode = 'AUTO' | 'START' | 'WAYPOINT' | 'DESTINATION';

interface AirspaceMapProps {
  zones: AirspaceZoneFeature[];
  coordinates: LngLat[];
  alternativeCoordinates?: LngLat[] | null;
  drawMode?: DrawMode;
  editable?: boolean;
  onChangeCoordinates?: (coords: LngLat[]) => void;
  fitTrigger?: number;
  heightClass?: string;
}

const ZONE_STYLE: Record<
  RestrictionLevel,
  { color: string; fillColor: string; fillOpacity: number; weight: number }
> = {
  RED: { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.28, weight: 2 },
  YELLOW: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.24, weight: 2 },
  GREEN: { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.18, weight: 1.75 },
};

function createPointIcon(label: string, bgHex: string, borderHex: string) {
  return L.divIcon({
    className: 'tenorix-marker',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:9999px;
      background:${bgHex};border:2.5px solid ${borderHex};
      color:#050a14;font-weight:800;font-size:11px;
      box-shadow:0 4px 12px rgba(0,0,0,0.45);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function MapClickHandler({
  editable,
  drawMode,
  coordinates,
  onChangeCoordinates,
}: {
  editable: boolean;
  drawMode: DrawMode;
  coordinates: LngLat[];
  onChangeCoordinates?: (coords: LngLat[]) => void;
}) {
  useMapEvents({
    click(e) {
      if (!editable || !onChangeCoordinates) return;
      const clicked: LngLat = [
        Number(e.latlng.lng.toFixed(6)),
        Number(e.latlng.lat.toFixed(6)),
      ];

      if (drawMode === 'START') {
        if (coordinates.length === 0) {
          onChangeCoordinates([clicked]);
        } else {
          onChangeCoordinates([clicked, ...coordinates.slice(1)]);
        }
        return;
      }

      if (drawMode === 'DESTINATION') {
        if (coordinates.length === 0) {
          onChangeCoordinates([clicked]);
        } else if (coordinates.length === 1) {
          onChangeCoordinates([coordinates[0], clicked]);
        } else {
          onChangeCoordinates([...coordinates.slice(0, -1), clicked]);
        }
        return;
      }

      if (drawMode === 'WAYPOINT') {
        if (coordinates.length < 2) {
          onChangeCoordinates([...coordinates, clicked]);
        } else {
          // Insert waypoint before the destination
          onChangeCoordinates([
            ...coordinates.slice(0, -1),
            clicked,
            coordinates[coordinates.length - 1],
          ]);
        }
        return;
      }

      // AUTO mode: append points seamlessly (1st = start, 2nd+ = route points)
      onChangeCoordinates([...coordinates, clicked]);
    },
  });
  return null;
}

function FitBoundsController({
  zones,
  coordinates,
  fitTrigger,
}: {
  zones: AirspaceZoneFeature[];
  coordinates: LngLat[];
  fitTrigger?: number;
}) {
  const map = useMap();

  useEffect(() => {
    const latLngs: L.LatLngExpression[] = [];
    for (const c of coordinates) {
      latLngs.push([c[1], c[0]]);
    }

    if (latLngs.length >= 2) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds.pad(0.35), { maxZoom: 15, animate: true });
      return;
    }

    if (zones.length > 0 && latLngs.length === 0) {
      const allPts: L.LatLngExpression[] = [];
      for (const z of zones) {
        if (z.geometry.type === 'Polygon') {
          for (const pt of z.geometry.coordinates[0] as number[][]) {
            allPts.push([pt[1], pt[0]]);
          }
        }
      }
      if (allPts.length > 0) {
        map.fitBounds(L.latLngBounds(allPts).pad(0.08));
      }
    }
  }, [fitTrigger, zones.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function RecenterButton({
  zones,
  coordinates,
}: {
  zones: AirspaceZoneFeature[];
  coordinates: LngLat[];
}) {
  const map = useMap();

  const handleFitAll = () => {
    const pts: L.LatLngExpression[] = coordinates.map((c) => [c[1], c[0]]);
    for (const z of zones) {
      if (z.geometry.type === 'Polygon') {
        for (const pt of z.geometry.coordinates[0] as number[][]) {
          pts.push([pt[1], pt[0]]);
        }
      }
    }
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts).pad(0.1));
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleFitAll();
      }}
      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-navy-900/95 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-md hover:border-cyan-500/50 hover:text-cyan-300 transition"
      title="Fit entire airspace & route"
    >
      <Maximize2 className="h-3.5 w-3.5" />
      Fit Airspace
    </button>
  );
}

export function AirspaceMap({
  zones,
  coordinates,
  alternativeCoordinates,
  drawMode = 'AUTO',
  editable = true,
  onChangeCoordinates,
  fitTrigger = 0,
  heightClass = 'h-[560px]',
}: AirspaceMapProps) {
  const [tileLayer, setTileLayer] = useState<'osm' | 'dark'>('osm');

  const routeLatLngs = useMemo<L.LatLngExpression[]>(
    () => coordinates.map((c) => [c[1], c[0]]),
    [coordinates]
  );

  const altLatLngs = useMemo<L.LatLngExpression[]>(
    () => (alternativeCoordinates ? alternativeCoordinates.map((c) => [c[1], c[0]]) : []),
    [alternativeCoordinates]
  );

  const handleMarkerDrag = (index: number, e: L.DragEndEvent) => {
    if (!editable || !onChangeCoordinates) return;
    const pos = e.target.getLatLng();
    const updated = [...coordinates];
    updated[index] = [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))];
    onChangeCoordinates(updated);
  };

  const handleDeletePoint = (index: number) => {
    if (!editable || !onChangeCoordinates) return;
    onChangeCoordinates(coordinates.filter((_, i) => i !== index));
  };

  const zonesKey = useMemo(
    () => zones.map((z) => z.properties.id).join(','),
    [zones]
  );

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-slate-700/80 bg-navy-900 shadow-xl ${heightClass}`}>
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

        <MapClickHandler
          editable={editable}
          drawMode={drawMode}
          coordinates={coordinates}
          onChangeCoordinates={onChangeCoordinates}
        />

        <FitBoundsController zones={zones} coordinates={coordinates} fitTrigger={fitTrigger} />

        {/* Airspace Polygons */}
        {zones.length > 0 && (
          <GeoJSON
            key={zonesKey}
            data={{ type: 'FeatureCollection', features: zones } as GeoJSON.GeoJsonObject}
            style={(feature) => {
              const level = (feature?.properties?.restrictionLevel as RestrictionLevel) || 'GREEN';
              return ZONE_STYLE[level];
            }}
            onEachFeature={(feature, layer) => {
              const p = feature.properties;
              if (!p) return;
              layer.bindTooltip(
                `<div style="font-size:12px;">
                  <strong>${p.id}: ${p.name}</strong><br/>
                  <span>Level: ${p.restrictionLevel} | Alt: ${p.minAltitudeMeters ?? 0}m–${p.maxAltitudeMeters ?? 0}m</span>
                </div>`,
                { sticky: true }
              );
              layer.bindPopup(
                `<div style="min-width:210px;font-size:12px;line-height:1.45;">
                  <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${p.id} — ${p.name}</div>
                  <div><strong>Level:</strong> ${p.restrictionLevel} (${p.zoneType})</div>
                  <div><strong>Rule ID:</strong> ${p.ruleId}</div>
                  <div><strong>Altitude:</strong> ${p.minAltitudeMeters ?? 0} m – ${p.maxAltitudeMeters ?? 0} m</div>
                  <div><strong>Permission Required:</strong> ${p.permissionRequired ? 'Yes (Demo)' : 'No'}</div>
                  <div style="margin-top:6px;color:#cbd5e1;">${p.description}</div>
                  <div style="margin-top:6px;font-size:10px;color:#fbbf24;">Synthetic Demo Zone Only</div>
                </div>`
              );
            }}
          />
        )}

        {/* Primary Flight Route */}
        {routeLatLngs.length >= 2 && (
          <Polyline
            positions={routeLatLngs}
            pathOptions={{
              color: '#38bdf8',
              weight: 4,
              opacity: 0.95,
            }}
          />
        )}

        {/* Alternative Candidate Detour Preview */}
        {altLatLngs.length >= 2 && (
          <Polyline
            positions={altLatLngs}
            pathOptions={{
              color: '#22d3ee',
              weight: 4,
              dashArray: '8 8',
              opacity: 0.95,
            }}
          >
            <Tooltip sticky>Alternative Route Candidate (Preview)</Tooltip>
          </Polyline>
        )}

        {/* Route Markers */}
        {coordinates.map((coord, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === coordinates.length - 1 && coordinates.length > 1;
          const label = isStart ? 'S' : isEnd ? 'D' : String(idx);
          const bg = isStart ? '#10b981' : isEnd ? '#f59e0b' : '#38bdf8';
          const border = '#ffffff';
          const title = isStart
            ? 'Start Point'
            : isEnd
              ? 'Destination Point'
              : `Waypoint ${idx}`;

          return (
            <Marker
              key={`pt-${idx}-${coord[0]}-${coord[1]}`}
              position={[coord[1], coord[0]]}
              icon={createPointIcon(label, bg, border)}
              draggable={editable}
              eventHandlers={{
                dragend: (e) => handleMarkerDrag(idx, e),
              }}
            >
              <Popup>
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-white">{title}</div>
                  <div className="font-mono text-slate-300">
                    Lat: {coord[1].toFixed(5)}, Lng: {coord[0].toFixed(5)}
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => handleDeletePoint(idx)}
                      className="mt-1 rounded bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-300 border border-red-500/40 hover:bg-red-500/30"
                    >
                      Remove Point
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Floating Map Controls (Top-Right) */}
        <div className="leaflet-top leaflet-right pointer-events-auto m-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
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
            <RecenterButton zones={zones} coordinates={coordinates} />
          </div>
        </div>
      </MapContainer>

      {/* Map Legend (Bottom-Left) */}
      <div className="pointer-events-auto absolute bottom-3 left-3 z-[400] rounded-xl border border-slate-700/80 bg-navy-950/90 px-3 py-2.5 text-[11px] backdrop-blur-md shadow-lg">
        <div className="mb-1.5 font-bold uppercase tracking-wider text-slate-300">
          Demo Airspace Legend
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-200 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80 border border-emerald-300" />
            GREEN (Open)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/80 border border-amber-300" />
            YELLOW (Conditional)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500/80 border border-red-300" />
            RED (Prohibited)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-cyan-400" />
            Active Route
          </span>
        </div>
      </div>
    </div>
  );
}
