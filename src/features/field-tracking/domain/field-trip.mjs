// Distância observada pelo GPS; não representa odômetro nem distância roteada.
const RADIUS_KM = 6371.0088;
const radians = value => value * Math.PI / 180;
export function distanceKm(a, b) {
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function valid(point) {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 &&
    Number.isFinite(Date.parse(point.recorded_at)) &&
    (point.accuracy_m == null || (Number.isFinite(Number(point.accuracy_m)) &&
      Number(point.accuracy_m) >= 0 && Number(point.accuracy_m) <= 100));
}
// Pontos em ordem cronológica. Lacunas e saltos não são conectados.
export function summarizeFieldTrip(points) {
  let distance = 0, rejected = 0, gaps = 0, accepted = 0;
  let previous = null;
  let lastObservation = null;
  let segment = [];
  const segments = [];
  const finish = () => { if (segment.length > 1) segments.push(segment); segment = []; };
  for (const point of points) {
    if (!valid(point)) { rejected++; finish(); previous = null; lastObservation = null; continue; }
    const position = [point.latitude, point.longitude];
    if (!previous) { segment = [position]; previous = point; lastObservation = point; accepted++; continue; }
    const elapsed = (Date.parse(point.recorded_at) - Date.parse(previous.recorded_at)) / 1000;
    const observationGap = (Date.parse(point.recorded_at) - Date.parse(lastObservation.recorded_at)) / 1000;
    if (observationGap <= 0 || elapsed <= 0) { rejected++; continue; }
    lastObservation = point;
    const km = distanceKm(previous, point);
    if (observationGap > 300 || km / elapsed * 3600 > 160) {
      gaps++; finish(); segment = [position]; previous = point; accepted++; continue;
    }
    // Evita somar pequenas oscilações do GPS quando não há movimento observado.
    if (km >= 0.015) {
      distance += km;
      segment.push(position);
      previous = point;
      accepted++;
    }
  }
  finish();
  return { distanceKm: distance, rejected, gaps, accepted, segments };
}
export function currentSpeedKmh(unit, now = Date.now()) {
  if (!unit.is_active || !unit.is_sharing || unit.speed_mps == null) return null;
  const seen = Date.parse(unit.last_seen_at ?? "");
  const recorded = Date.parse(unit.last_recorded_at ?? "");
  const speed = Number(unit.speed_mps);
  if (!Number.isFinite(seen) || !Number.isFinite(recorded) ||
      now - seen > 60000 || now - recorded > 60000 ||
      seen - now > 30000 || recorded - now > 30000 ||
      !Number.isFinite(speed) || speed < 0 || speed > 160 / 3.6) return null;
  return Math.round(speed * 3.6);
}
