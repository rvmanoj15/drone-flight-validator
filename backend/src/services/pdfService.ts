import PDFDocument from 'pdfkit';
import {
  AirspaceZoneFeature,
  AlternativeRouteCandidate,
  LngLat,
  ValidationRecord,
} from '../types/index.js';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatRouteSequence(coords: LngLat[], waypointPrefix = 'WP'): string {
  return coords
    .map((pt, idx) => {
      const tag =
        idx === 0 ? 'START' : idx === coords.length - 1 ? 'DEST' : `${waypointPrefix}${idx}`;
      return `${tag}(${pt[0].toFixed(5)}, ${pt[1].toFixed(5)})`;
    })
    .join(' -> ');
}

function getVerdictColors(verdict: ValidationRecord['verdict']) {
  if (verdict === 'APPROVED') {
    return { bg: '#DCFCE7', border: '#16A34A', text: '#166534' };
  }
  if (verdict === 'CONDITIONAL') {
    return { bg: '#FEF3C7', border: '#D97706', text: '#92400E' };
  }
  return { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B' };
}

function getZoneCanvasColors(level: AirspaceZoneFeature['properties']['restrictionLevel']) {
  if (level === 'RED') {
    return { fill: '#FECACA', stroke: '#DC2626', label: '#991B1B' };
  }
  if (level === 'YELLOW') {
    return { fill: '#FDE68A', stroke: '#D97706', label: '#92400E' };
  }
  return { fill: '#BBF7D0', stroke: '#16A34A', label: '#166534' };
}

/**
 * Renders a crisp 2D vector map of synthetic airspace zones, the given route,
 * and any updated/corrected drone path directly inside the PDF document.
 */
function drawRouteDiagram(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  record: ValidationRecord,
  zones: AirspaceZoneFeature[],
  bestAlternative?: AlternativeRouteCandidate
) {
  const allCoords: LngLat[] = [...record.coordinates];
  if (record.originalCoordinates) {
    allCoords.push(...record.originalCoordinates);
  }
  if (bestAlternative) {
    allCoords.push(...bestAlternative.coordinates);
  }
  for (const z of zones) {
    if (z.geometry.type === 'Polygon') {
      for (const pt of z.geometry.coordinates[0] as number[][]) {
        allCoords.push([pt[0], pt[1]]);
      }
    } else if (z.geometry.type === 'MultiPolygon') {
      for (const poly of z.geometry.coordinates as number[][][][]) {
        for (const pt of poly[0] ?? []) {
          allCoords.push([pt[0], pt[1]]);
        }
      }
    }
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of allCoords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (!Number.isFinite(minLng) || maxLng === minLng) {
    minLng -= 0.01;
    maxLng += 0.01;
  }
  if (!Number.isFinite(minLat) || maxLat === minLat) {
    minLat -= 0.01;
    maxLat += 0.01;
  }

  const padLng = (maxLng - minLng) * 0.08;
  const padLat = (maxLat - minLat) * 0.1;
  minLng -= padLng;
  maxLng += padLng;
  minLat -= padLat;
  maxLat += padLat;

  const padPx = 16;
  const innerW = width - padPx * 2;
  const innerH = height - padPx * 2 - 10;
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;

  const scale = Math.min(innerW / lngSpan, innerH / latSpan);
  const drawnW = lngSpan * scale;
  const drawnH = latSpan * scale;
  const offsetX = x + padPx + (innerW - drawnW) / 2;
  const offsetY = y + padPx + (innerH - drawnH) / 2;

  const project = (pt: LngLat): [number, number] => [
    offsetX + (pt[0] - minLng) * scale,
    offsetY + (maxLat - pt[1]) * scale,
  ];

  // Map container background
  doc.save();
  doc.rect(x, y, width, height).fillAndStroke('#F1F5F9', '#CBD5E1');
  doc.rect(x, y, width, height).clip();

  // Draw synthetic zones
  for (const zone of zones) {
    const rings: number[][][] =
      zone.geometry.type === 'Polygon'
        ? (zone.geometry.coordinates as number[][][])
        : (zone.geometry.coordinates[0] as number[][][]);
    const outer = rings[0];
    if (!outer || outer.length < 3) continue;

    const zColors = getZoneCanvasColors(zone.properties.restrictionLevel);
    const projectedPts = outer.map((c) => project([c[0], c[1]]));

    doc.save();
    doc.fillOpacity(0.55).strokeOpacity(0.9).lineWidth(1);
    doc.moveTo(projectedPts[0][0], projectedPts[0][1]);
    for (let i = 1; i < projectedPts.length; i++) {
      doc.lineTo(projectedPts[i][0], projectedPts[i][1]);
    }
    doc.closePath().fillAndStroke(zColors.fill, zColors.stroke);
    doc.restore();

    const avgX = projectedPts.reduce((s, p) => s + p[0], 0) / projectedPts.length;
    const avgY = projectedPts.reduce((s, p) => s + p[1], 0) / projectedPts.length;
    doc
      .fillColor(zColors.label)
      .fontSize(6.5)
      .font('Helvetica-Bold')
      .text(zone.properties.id, avgX - 12, avgY - 3, { width: 24, align: 'center' });
  }

  // If this route was updated/corrected from an earlier given route, draw the previous given route in dashed red
  if (record.originalCoordinates && record.originalCoordinates.length >= 2) {
    const origPts = record.originalCoordinates.map((c) => project(c));
    doc.save();
    doc.lineWidth(1.8).strokeColor('#DC2626').dash(4, { space: 3 });
    doc.moveTo(origPts[0][0], origPts[0][1]);
    for (let i = 1; i < origPts.length; i++) {
      doc.lineTo(origPts[i][0], origPts[i][1]);
    }
    doc.stroke();
    doc.undash();
    doc.restore();
  }

  // Draw active route LineString
  if (record.coordinates.length >= 2) {
    const routePts = record.coordinates.map((c) => project(c));
    const activeStroke =
      record.verdict === 'REJECTED'
        ? '#DC2626'
        : record.originalCoordinates
          ? '#059669'
          : '#0284C7';
    doc.save();
    doc.lineWidth(2.4).strokeColor(activeStroke);
    doc.moveTo(routePts[0][0], routePts[0][1]);
    for (let i = 1; i < routePts.length; i++) {
      doc.lineTo(routePts[i][0], routePts[i][1]);
    }
    doc.stroke();
    doc.restore();

    // Draw Start, Waypoint, and Destination markers
    routePts.forEach(([px, py], idx) => {
      const isStart = idx === 0;
      const isDest = idx === routePts.length - 1;
      const fill = isStart ? '#10B981' : isDest ? '#F59E0B' : '#38BDF8';
      const label = isStart ? 'S' : isDest ? 'D' : String(idx);

      doc.save();
      doc.circle(px, py, 5.5).fillAndStroke(fill, '#0F172A');
      doc
        .fillColor('#0F172A')
        .fontSize(6)
        .font('Helvetica-Bold')
        .text(label, px - 5, py - 2.6, { width: 10, align: 'center' });
      doc.restore();
    });
  }

  // If REJECTED and a corrected detour candidate exists, overlay it in dashed emerald/teal
  if (bestAlternative && bestAlternative.coordinates.length >= 2) {
    const altPts = bestAlternative.coordinates.map((c) => project(c));
    doc.save();
    doc.lineWidth(2.2).strokeColor('#059669').dash(5, { space: 3 });
    doc.moveTo(altPts[0][0], altPts[0][1]);
    for (let i = 1; i < altPts.length; i++) {
      doc.lineTo(altPts[i][0], altPts[i][1]);
    }
    doc.stroke();
    doc.undash();
    doc.restore();

    // Mark intermediate corrected detour waypoints C1, C2...
    altPts.slice(1, -1).forEach(([px, py], idx) => {
      doc.save();
      doc.circle(px, py, 5).fillAndStroke('#10B981', '#064E3B');
      doc
        .fillColor('#FFFFFF')
        .fontSize(5.5)
        .font('Helvetica-Bold')
        .text(`C${idx + 1}`, px - 5, py - 2.4, { width: 10, align: 'center' });
      doc.restore();
    });
  }

  doc.restore();

  // Dynamic map legend bar
  let legendText = 'Legend: S = Start | 1..n = Waypoints | D = Destination';
  if (record.originalCoordinates) {
    legendText += ' | Dashed Red = Previous Given Route | Solid Green = Updated Drone Path';
  } else if (bestAlternative) {
    legendText += ' | Solid Red = Given Route | Dashed Green (C1..n) = Corrected Drone Path';
  } else {
    legendText += ' | Solid Blue = Active Drone Route';
  }

  doc
    .fillColor('#334155')
    .fontSize(6.8)
    .font('Helvetica')
    .text(legendText, x + 8, y + height - 11, { width: width - 16 });
}

/**
 * Generates a downloadable PDF flight validation report using PDFKit.
 */
export function generateValidationPdfBuffer(
  record: ValidationRecord,
  zones: AirspaceZoneFeature[] = [],
  alternatives: AlternativeRouteCandidate[] = record.alternativeRoutes ?? []
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    const pageWidth = doc.page.width - 90;
    const bestAlternative = alternatives[0];

    // Header Banner
    doc.rect(45, 40, pageWidth, 64).fill('#0B1220');
    doc.fillColor('#38BDF8').fontSize(18).font('Helvetica-Bold').text('TENORIX', 60, 54);
    doc
      .fillColor('#E2E8F0')
      .fontSize(9.5)
      .font('Helvetica')
      .text('Drone Flight Plan Validator with Airspace Zone Rules — Prototype Report', 60, 77);
    doc
      .fillColor('#94A3B8')
      .fontSize(8.5)
      .text(`Validation ID: ${record.validationId}`, 380, 56, { align: 'right', width: 155 })
      .text(`Generated: ${new Date(record.timestamp).toUTCString()}`, 335, 72, {
        align: 'right',
        width: 200,
      });

    doc.y = 120;

    // Synthetic Data Warning Banner
    doc.rect(45, doc.y, pageWidth, 34).fillAndStroke('#FFFBEB', '#F59E0B');
    doc
      .fillColor('#92400E')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('PROTOTYPE DISCLAIMER: ', 55, doc.y + 7, { continued: true })
      .font('Helvetica')
      .text(
        'Generated using synthetic demo airspace data. Not an official aviation clearance or legal flight authorization.',
        { width: pageWidth - 20 }
      );

    doc.y += 46;

    // Verdict Box
    const vColors = getVerdictColors(record.verdict);
    doc.rect(45, doc.y, pageWidth, 48).fillAndStroke(vColors.bg, vColors.border);
    doc
      .fillColor(vColors.text)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('VALIDATION VERDICT', 58, doc.y + 8);
    doc
      .fillColor(vColors.text)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(record.verdict, 58, doc.y + 22);
    doc
      .fillColor('#334155')
      .fontSize(9.5)
      .font('Helvetica')
      .text(`Flight Plan: ${record.flightPlanName}`, 230, doc.y + 12, { width: 300, align: 'right' })
      .text(`Rule Version: ${record.ruleVersion} | Dataset: ${record.datasetSource}`, 210, doc.y + 28, {
        width: 320,
        align: 'right',
      });

    doc.y += 62;

    // Flight Parameters Section
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('1. Flight Plan Telemetry & Route Snapshot', 45);
    doc.moveDown(0.4);

    const startY = doc.y;
    doc.rect(45, startY, pageWidth, 84).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.fillColor('#1E293B').fontSize(9).font('Helvetica');
    const col1X = 56;
    const col2X = 310;

    doc
      .font('Helvetica-Bold')
      .text('Flight Plan ID: ', col1X, startY + 10, { continued: true })
      .font('Helvetica')
      .text(record.flightPlanId);
    doc
      .font('Helvetica-Bold')
      .text('Planned Altitude: ', col1X, startY + 26, { continued: true })
      .font('Helvetica')
      .text(`${record.plannedAltitudeMeters} m AGL`);
    doc
      .font('Helvetica-Bold')
      .text('Route Distance: ', col1X, startY + 42, { continued: true })
      .font('Helvetica')
      .text(`${record.routeDistanceMeters} m (${(record.routeDistanceMeters / 1000).toFixed(2)} km)`);
    doc
      .font('Helvetica-Bold')
      .text('Estimated Flight Time: ', col1X, startY + 58, { continued: true })
      .font('Helvetica')
      .text(`${formatDuration(record.estimatedFlightTimeSeconds)} @ ${record.flightSpeedMps} m/s`);

    doc
      .font('Helvetica-Bold')
      .text('Drone Model: ', col2X, startY + 10, { continued: true })
      .font('Helvetica')
      .text(record.droneModel);
    doc
      .font('Helvetica-Bold')
      .text('Demo Permission: ', col2X, startY + 26, { continued: true })
      .font('Helvetica')
      .text(record.permissionGranted ? 'Supplied' : 'Not Supplied');
    doc
      .font('Helvetica-Bold')
      .text('Start (Lng, Lat): ', col2X, startY + 42, { continued: true })
      .font('Helvetica')
      .text(`${record.startPoint[0].toFixed(5)}, ${record.startPoint[1].toFixed(5)}`);
    doc
      .font('Helvetica-Bold')
      .text('Destination (Lng, Lat): ', col2X, startY + 58, { continued: true })
      .font('Helvetica')
      .text(`${record.destination[0].toFixed(5)}, ${record.destination[1].toFixed(5)}`);

    doc.y = startY + 94;

    // Ordered Coordinate Sequences
    if (record.originalCoordinates && record.originalCoordinates.length >= 2) {
      doc
        .fillColor('#991B1B')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text('Previous Given Route: ', 45, doc.y, { continued: true })
        .font('Helvetica')
        .text(formatRouteSequence(record.originalCoordinates), { width: pageWidth });
      doc.moveDown(0.25);
      doc
        .fillColor('#166534')
        .fontSize(8.8)
        .font('Helvetica-Bold')
        .text('Updated / Corrected Drone Path: ', 45, doc.y, { continued: true })
        .font('Helvetica')
        .text(formatRouteSequence(record.coordinates), { width: pageWidth });
    } else {
      doc
        .fillColor('#334155')
        .fontSize(8.8)
        .font('Helvetica-Bold')
        .text('Given Route Sequence: ', 45, doc.y, { continued: true })
        .font('Helvetica')
        .text(formatRouteSequence(record.coordinates), { width: pageWidth });
    }

    doc.moveDown(0.5);

    // Visual Route & Airspace Diagram
    const diagramHeight = 165;
    if (doc.y + diagramHeight > 740) doc.addPage();
    drawRouteDiagram(doc, 45, doc.y, pageWidth, diagramHeight, record, zones, bestAlternative);
    doc.y += diagramHeight + 12;

    // Corrected Drone Path Section (if a detour candidate was generated for a REJECTED route)
    if (bestAlternative) {
      if (doc.y > 670) doc.addPage();
      doc.rect(45, doc.y, pageWidth, 72).fillAndStroke('#ECFDF5', '#10B981');
      doc
        .fillColor('#065F46')
        .fontSize(10.5)
        .font('Helvetica-Bold')
        .text('Corrected Drone Path (Recommended Bypass)', 56, doc.y + 8);
      doc
        .fillColor('#047857')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text(
          `Verdict: ${bestAlternative.verdict}  |  Strategy: ${bestAlternative.strategy}  |  Distance: ${bestAlternative.routeDistanceMeters} m (${bestAlternative.distanceDeltaMeters >= 0 ? '+' : ''}${bestAlternative.distanceDeltaMeters} m)  |  ETA: ${formatDuration(bestAlternative.estimatedFlightTimeSeconds)}`,
          56,
          doc.y + 24,
          { width: pageWidth - 22 }
        );
      doc
        .fillColor('#064E3B')
        .fontSize(8.3)
        .font('Helvetica')
        .text(
          `Corrected Path Sequence: ${formatRouteSequence(bestAlternative.coordinates, 'C')}`,
          56,
          doc.y + 40,
          { width: pageWidth - 22 }
        );
      doc.y += 82;
    }

    // Intersected Zones
    if (doc.y > 700) doc.addPage();
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('2. Intersected Airspace Zones', 45);
    doc.moveDown(0.35);
    if (record.intersections.length === 0) {
      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('No synthetic airspace zones intersected by this route.', 45);
    } else {
      for (const hit of record.intersections) {
        if (doc.y > 720) doc.addPage();
        doc
          .fillColor('#0F172A')
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .text(
            `• [${hit.restrictionLevel}] ${hit.zoneId} — ${hit.zoneName} (${hit.ruleId}, ${hit.intersectionType})`,
            50
          );
        doc.fillColor('#334155').fontSize(8.8).font('Helvetica').text(hit.summary, 62, doc.y, { width: pageWidth - 20 });
        doc.moveDown(0.35);
      }
    }

    doc.moveDown(0.5);

    // Rule Checks
    if (doc.y > 680) doc.addPage();
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('3. Rule-Check Evaluation Results', 45);
    doc.moveDown(0.35);
    for (const chk of record.checks) {
      if (doc.y > 730) doc.addPage();
      const statusColor = chk.status === 'PASS' ? '#15803D' : chk.status === 'WARN' ? '#B45309' : '#B91C1C';
      doc
        .fillColor(statusColor)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`[${chk.status}] `, 50, doc.y, { continued: true })
        .fillColor('#0F172A')
        .text(`${chk.title} (${chk.ruleId})`);
      doc.fillColor('#334155').fontSize(8.8).font('Helvetica').text(chk.explanation, 62, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);

    // Violations, Warnings, Recommendations
    const renderList = (heading: string, items: string[], color: string, emptyText: string) => {
      if (doc.y > 700) doc.addPage();
      doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text(heading, 45);
      doc.moveDown(0.25);
      if (items.length === 0) {
        doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(emptyText, 52);
      } else {
        for (const item of items) {
          if (doc.y > 740) doc.addPage();
          doc.fillColor(color).fontSize(9).font('Helvetica').text(`• ${item}`, 52, doc.y, { width: pageWidth - 15 });
          doc.moveDown(0.2);
        }
      }
      doc.moveDown(0.45);
    };

    renderList('4. Detected Violations', record.violations, '#B91C1C', 'No hard rule violations detected.');
    renderList('5. Conditional Warnings', record.warnings, '#B45309', 'No conditional warnings.');
    renderList('6. Recommendations & Next Actions', record.recommendations, '#0369A1', 'No additional actions.');

    // Footer Disclaimer
    if (doc.y > 735) doc.addPage();
    doc.moveDown(0.5);
    doc.strokeColor('#CBD5E1').moveTo(45, doc.y).lineTo(45 + pageWidth, doc.y).stroke();
    doc.moveDown(0.4);
    doc.fillColor('#64748B').fontSize(7.8).font('Helvetica').text(record.disclaimer, 45, doc.y, { width: pageWidth });

    doc.end();
  });
}
