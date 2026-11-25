# Geospatial Validation & Detour Algorithm

## 1. Input & Geometry Verification
- Route coordinates must contain at least 2 finite `[longitude, latitude]` pairs with `longitude ∈ [-180, 180]` and `latitude ∈ [-90, 90]`.
- Planned altitude must be a finite number in `[0, 5000]` meters.
- Every zone polygon is validated using `validateZonePolygon`: closed outer/inner rings (`first === last`, ≥ 4 vertices), `turf.booleanValid`, and `turf.kinks` (no self-intersections).

## 2. Full-Route Intersection Detection
1. Convert route coordinates into a GeoJSON `LineString` and calculate total geodesic length via `turf.length(..., { units: 'meters' })`.
2. Iterate through all valid airspace polygons and evaluate `turf.booleanIntersects(routeLine, zonePolygon)`.
3. Classify each detected intersection into:
   - `FULL_CORRIDOR`: both endpoints inside and `booleanWithin` holds.
   - `ENDPOINT`: start or destination point lies strictly inside the zone.
   - `MIDDLE_SEGMENT`: both endpoints are outside, yet an intermediate vertex, crossing (`lineIntersect` ≥ 2), or segment midpoint lies strictly inside the polygon.
   - `BOUNDARY_TOUCH`: route grazes a vertex or edge without entering the polygon interior.

## 3. Rule & Altitude Evaluation
- **RED zones:** Prohibited under prototype rules; any intersection marks a hard violation (`REJECTED`).
- **YELLOW zones:** Conditional; if `permissionRequired` is true and `permissionGranted` is false, records a conditional warning (`CONDITIONAL`). Also enforces `[minAltitudeMeters, maxAltitudeMeters]` as a hard constraint (`REJECTED` if out of range).
- **GREEN zones:** Permitted; enforces `[minAltitudeMeters, maxAltitudeMeters]` (`REJECTED` if out of range).
- **Unzoned routes:** Checked against a default prototype ceiling of `120 m`.

## 4. Verdict Priority
`REJECTED` (any hard violation) > `CONDITIONAL` (unmet permission/condition without hard violation) > `APPROVED`.

## 5. Route Alternative Assistance
When RED zone intersection(s) occur:
1. Buffer each blocking RED polygon by progressive offsets (`180 m`, `320 m`, `500 m`, `750 m`) via `turf.buffer`.
2. Extract bounding-box corner/apex offsets and clockwise/counter-clockwise buffered perimeter arcs between entry and exit points.
3. Evaluate every candidate route through `validateFlightRoute`.
4. Discard any candidate that still hits a RED zone or yields `REJECTED`.
5. Rank surviving candidates (`APPROVED` ahead of `CONDITIONAL`, then shortest route distance).

*Limitation:* This is a 2D horizontal polygon-buffer heuristic and does not account for 3D terrain elevation, obstacles, or dynamic weather.
