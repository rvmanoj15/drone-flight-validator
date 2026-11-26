import crypto from 'node:crypto';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AirspaceZoneFeature, LngLat, RestrictionLevel } from '../types/index.js';
import {
  DATASET_SOURCE,
  RULE_VERSION,
  normalizeClosedRing,
  validateZonePolygon,
} from '../validators/inputValidators.js';

const PAYLOAD_PREFIX = 'TENORIX_ZONES_B64:';

function getZoneCanvasColors(level: RestrictionLevel) {
  if (level === 'RED') {
    return { fill: '#FECACA', stroke: '#DC2626', label: '#991B1B' };
  }
  if (level === 'YELLOW') {
    return { fill: '#FDE68A', stroke: '#D97706', label: '#92400E' };
  }
  return { fill: '#BBF7D0', stroke: '#16A34A', label: '#166534' };
}

function drawAirspaceOverviewMap(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  zones: AirspaceZoneFeature[]
) {
  const allCoords: LngLat[] = [];
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

  if (allCoords.length === 0) {
    doc.rect(x, y, width, height).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc
      .fillColor('#475569')
      .fontSize(10)
      .font('Helvetica')
      .text('No airspace zones configured in this briefing.', x, y + height / 2 - 6, {
        width,
        align: 'center',
      });
    return;
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

  if (maxLng === minLng) {
    minLng -= 0.01;
    maxLng += 0.01;
  }
  if (maxLat === minLat) {
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
  const innerH = height - padPx * 2 - 12;
  const scale = Math.min(innerW / (maxLng - minLng), innerH / (maxLat - minLat));
  const offsetX = x + padPx + (innerW - (maxLng - minLng) * scale) / 2;
  const offsetY = y + padPx + (innerH - (maxLat - minLat) * scale) / 2;

  const project = (pt: LngLat): [number, number] => [
    offsetX + (pt[0] - minLng) * scale,
    offsetY + (maxLat - pt[1]) * scale,
  ];

  doc.save();
  doc.rect(x, y, width, height).fillAndStroke('#F1F5F9', '#CBD5E1');
  doc.rect(x, y, width, height).clip();

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
    doc.fillOpacity(0.55).strokeOpacity(0.95).lineWidth(1.2);
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
      .fontSize(7)
      .font('Helvetica-Bold')
      .text(zone.properties.id, avgX - 14, avgY - 3.5, { width: 28, align: 'center' });
  }

  doc.restore();
  doc
    .fillColor('#334155')
    .fontSize(7)
    .font('Helvetica')
    .text(
      'Legend: RED = Prohibited No-Fly | YELLOW = Conditional (Permission/Alt) | GREEN = Open Corridor',
      x + 8,
      y + height - 11,
      { width: width - 16 }
    );
}

/**
 * Generates an Admin Airspace Zones Briefing PDF containing:
 * 1) 2D Vector Airspace Map
 * 2) Human-readable zone coordinates & rules table
 * 3) Lossless compressed GeoJSON payload + SHA-256 digest in PDF metadata for Pilot upload
 */
export function generateAirspaceBriefingPdfBuffer(zones: AirspaceZoneFeature[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const payloadObj = {
      version: 'TENORIX_AIRSPACE_V1',
      generatedAt: new Date().toISOString(),
      zones,
    };
    const serialized = JSON.stringify(payloadObj);
    const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
    const compressedB64 = zlib.deflateSync(Buffer.from(serialized, 'utf-8')).toString('base64');
    const embeddedToken = `${PAYLOAD_PREFIX}${compressedB64}|SHA256:${sha256}`;

    const doc = new PDFDocument({
      margin: 45,
      size: 'A4',
      info: {
        Title: 'TENORIX Airspace Zones Briefing',
        Author: 'TENORIX Admin Airspace Editor',
        Subject: `TENORIX Synthetic Airspace Zones (${zones.length} zones)`,
        Keywords: embeddedToken,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    const pageWidth = doc.page.width - 90;

    // Header
    doc.rect(45, 40, pageWidth, 64).fill('#0B1220');
    doc.fillColor('#38BDF8').fontSize(18).font('Helvetica-Bold').text('TENORIX', 60, 54);
    doc
      .fillColor('#E2E8F0')
      .fontSize(9.5)
      .font('Helvetica')
      .text('Admin Airspace Zones Briefing — Uploadable Pilot Package', 60, 77);
    doc
      .fillColor('#94A3B8')
      .fontSize(8.5)
      .text(`Zones Included: ${zones.length}`, 380, 56, { align: 'right', width: 155 })
      .text(`Issued: ${new Date().toUTCString()}`, 335, 72, { align: 'right', width: 200 });

    doc.y = 118;

    // Disclaimer
    doc.rect(45, doc.y, pageWidth, 32).fillAndStroke('#FFFBEB', '#F59E0B');
    doc
      .fillColor('#92400E')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('SYNTHETIC AIRSPACE BRIEFING: ', 55, doc.y + 7, { continued: true })
      .font('Helvetica')
      .text(
        'Upload this PDF in the TENORIX Flight Planner to validate a drone route against these exact zone boundaries.',
        { width: pageWidth - 20 }
      );

    doc.y += 44;

    // Map Image Snapshot
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('1. Airspace Zones Map Overview', 45);
    doc.moveDown(0.35);
    const mapHeight = 205;
    drawAirspaceOverviewMap(doc, 45, doc.y, pageWidth, mapHeight, zones);
    doc.y += mapHeight + 14;

    // Zone Coordinates & Rules Directory
    doc
      .fillColor('#0F172A')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(`2. Configured Airspace Zone Coordinates & Rules (${zones.length})`, 45);
    doc.moveDown(0.4);

    if (zones.length === 0) {
      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('No zones defined.', 45);
    } else {
      for (const z of zones) {
        if (doc.y > 700) doc.addPage();
        const p = z.properties;
        const levelColor =
          p.restrictionLevel === 'RED'
            ? '#B91C1C'
            : p.restrictionLevel === 'YELLOW'
              ? '#B45309'
              : '#15803D';

        doc
          .fillColor(levelColor)
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .text(`[${p.restrictionLevel}] `, 45, doc.y, { continued: true })
          .fillColor('#0F172A')
          .text(`${p.id} — ${p.name} (${p.ruleId})`);

        const altText =
          p.restrictionLevel === 'RED'
            ? 'No Entry (0 m)'
            : `${p.minAltitudeMeters ?? 0} m – ${p.maxAltitudeMeters ?? 120} m AGL`;

        doc
          .fillColor('#334155')
          .fontSize(8.5)
          .font('Helvetica')
          .text(
            `Altitude: ${altText} | Permission Required: ${p.permissionRequired ? 'Yes' : 'No'} | ${p.description}`,
            55,
            doc.y,
            { width: pageWidth - 10 }
          );

        const ring =
          z.geometry.type === 'Polygon'
            ? (z.geometry.coordinates[0] as number[][])
            : (z.geometry.coordinates[0][0] as number[][]);
        const coordsLine = ring.map((c) => `[${c[0].toFixed(5)}, ${c[1].toFixed(5)}]`).join(', ');
        doc
          .fillColor('#475569')
          .fontSize(7.8)
          .font('Helvetica')
          .text(`Coordinates: ${coordsLine}`, 55, doc.y, { width: pageWidth - 10 });

        doc.moveDown(0.45);
      }
    }

    // Verification Footer
    if (doc.y > 725) doc.addPage();
    doc.moveDown(0.4);
    doc.strokeColor('#CBD5E1').moveTo(45, doc.y).lineTo(45 + pageWidth, doc.y).stroke();
    doc.moveDown(0.35);
    doc
      .fillColor('#64748B')
      .fontSize(7.5)
      .font('Helvetica')
      .text(
        `TENORIX Airspace Package • Integrity SHA-256: ${sha256.slice(0, 24)}... • Synthetic Demo Data Only`,
        45,
        doc.y,
        { width: pageWidth }
      );

    doc.end();
  });
}

export interface ParsedPdfZonesResult {
  zones: AirspaceZoneFeature[];
  checksumVerified: boolean;
  extractionMethod: 'EMBEDDED_GEOJSON' | 'TEXT_FALLBACK';
  warnings: string[];
}

/**
 * Fallback parser for plain-text PDFs containing [lng, lat] coordinate lists.
 */
function parseZonesFromPlainText(fullText: string): AirspaceZoneFeature[] {
  const zones: AirspaceZoneFeature[] = [];
  // Match sections starting with [RED] / [YELLOW] / [GREEN] or zone lines with Coordinates:
  const lines = fullText.split(/\r?\n|(?=\[(?:RED|YELLOW|GREEN)\])/);
  let currentLevel: RestrictionLevel = 'RED';
  let currentName = 'Imported PDF Zone';
  let idx = 1;

  for (const chunk of lines) {
    const levelMatch = chunk.match(/\[(RED|YELLOW|GREEN)\]\s*([A-Z]{2}-\d+)?\s*[—-]?\s*([^\n(]+)?/i);
    if (levelMatch) {
      currentLevel = levelMatch[1].toUpperCase() as RestrictionLevel;
      if (levelMatch[3]) {
        currentName = levelMatch[3].trim();
      }
    }

    const coordMatches = [...chunk.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)];
    if (coordMatches.length >= 3) {
      const pts: LngLat[] = coordMatches.map((m) => [Number(m[1]), Number(m[2])]);
      const ring = normalizeClosedRing(pts);
      const zoneId = `PDF-${currentLevel[0]}${String(idx).padStart(2, '0')}`;
      const feature: AirspaceZoneFeature = {
        type: 'Feature',
        id: zoneId,
        properties: {
          id: zoneId,
          name: currentName || `PDF ${currentLevel} Zone ${idx}`,
          zoneType: currentLevel === 'RED' ? 'PROHIBITED_PDF' : currentLevel === 'YELLOW' ? 'CAUTION_PDF' : 'CORRIDOR_PDF',
          restrictionLevel: currentLevel,
          description: 'Extracted from uploaded PDF coordinate text.',
          minAltitudeMeters: currentLevel === 'RED' ? 0 : currentLevel === 'YELLOW' ? 15 : 0,
          maxAltitudeMeters: currentLevel === 'RED' ? 0 : currentLevel === 'YELLOW' ? 90 : 120,
          ruleId: `RULE-PDF-${idx}`,
          ruleVersion: RULE_VERSION,
          permissionRequired: currentLevel === 'YELLOW',
          dataSource: DATASET_SOURCE,
          lastUpdated: new Date().toISOString(),
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      };
      if (validateZonePolygon(feature).valid) {
        zones.push(feature);
        idx++;
      }
    }
  }

  return zones;
}

/**
 * Extracts and validates airspace zone polygons from an uploaded PDF buffer.
 * Primarily decodes lossless embedded TENORIX_ZONES_B64 GeoJSON metadata,
 * with a fallback text coordinate parser for plain-text PDFs.
 */
export async function parseAirspaceZonesFromPdf(pdfBuffer: Buffer): Promise<ParsedPdfZonesResult> {
  const warnings: string[] = [];
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    verbosity: 0,
  });

  const pdfDoc = await loadingTask.promise;

  // 1) Try lossless metadata payload first
  const meta = await pdfDoc.getMetadata();
  const info = (meta.info ?? {}) as Record<string, unknown>;
  const candidates = [String(info.Keywords ?? ''), String(info.Subject ?? '')];

  for (const field of candidates) {
    const markerIdx = field.indexOf(PAYLOAD_PREFIX);
    if (markerIdx >= 0) {
      const token = field.slice(markerIdx + PAYLOAD_PREFIX.length);
      const [b64Part, hashPart] = token.split('|SHA256:');
      const rawJson = zlib.inflateSync(Buffer.from(b64Part.trim(), 'base64')).toString('utf-8');
      const expectedHash = hashPart?.trim();
      const actualHash = crypto.createHash('sha256').update(rawJson).digest('hex');
      const checksumVerified = Boolean(expectedHash && expectedHash === actualHash);

      if (expectedHash && !checksumVerified) {
        warnings.push('PDF integrity checksum mismatch; zone payload may have been modified.');
      }

      const parsed = JSON.parse(rawJson) as { zones?: AirspaceZoneFeature[] };
      const validZones = (parsed.zones ?? []).filter((z) => {
        const check = validateZonePolygon(z);
        if (!check.valid) {
          warnings.push(`Skipped invalid zone ${z.properties?.id ?? 'unknown'}: ${check.reason}`);
        }
        return check.valid;
      });

      if (validZones.length === 0) {
        throw new Error('The uploaded TENORIX PDF contains zero valid airspace zone polygons.');
      }

      return {
        zones: validZones,
        checksumVerified,
        extractionMethod: 'EMBEDDED_GEOJSON',
        warnings,
      };
    }
  }

  // 2) Fallback: extract text content from all pages and look for coordinate polygons
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += `${pageText}\n`;
  }

  const textZones = parseZonesFromPlainText(fullText);
  if (textZones.length > 0) {
    warnings.push('Parsed coordinates from PDF text fallback (no embedded TENORIX metadata block found).');
    return {
      zones: textZones,
      checksumVerified: false,
      extractionMethod: 'TEXT_FALLBACK',
      warnings,
    };
  }

  throw new Error(
    'No recognizable airspace zone coordinates found in the uploaded PDF. Download an Airspace PDF from the TENORIX Admin Panel and upload it here.'
  );
}
