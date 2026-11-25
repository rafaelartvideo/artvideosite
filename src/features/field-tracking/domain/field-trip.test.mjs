import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, summarizeFieldTrip, currentSpeedKmh } from "./field-trip.mjs";

const start = Date.parse("2026-11-25T10:00:00Z");
const point = (seconds, longitude, extra = {}) => ({
  latitude: 0, longitude, accuracy_m: 5,
  recorded_at: new Date(start + seconds * 1000).toISOString(), ...extra,
});

test("distance and observed track match known coordinates", () => {
  assert.ok(Math.abs(distanceKm(point(0, 0), point(60, 0.01)) - 1.11195) < 0.001);
  const trip = summarizeFieldTrip([point(0, 0), point(60, 0.01), point(120, 0.02)]);
  assert.ok(Math.abs(trip.distanceKm - 2.2239) < 0.001);
  assert.equal(trip.segments.length, 1);
});

test("does not invent travel over gaps or unrealistic GPS jumps", () => {
  const trip = summarizeFieldTrip([point(0, 0), point(60, 0.01), point(500, 0.02),
    point(501, 2), point(561, 2.01)]);
  assert.equal(trip.gaps, 2);
  assert.equal(trip.segments.length, 2);
  assert.ok(Math.abs(trip.distanceKm - 2.2239) < 0.001);
});

test("filters stationary jitter and does not mistake continuous stationary data for signal loss", () => {
  const points = Array.from({ length: 30 }, (_, i) => point(i * 30, i % 2 ? 0.00003 : 0));
  const trip = summarizeFieldTrip(points);
  assert.equal(trip.distanceKm, 0);
  assert.equal(trip.gaps, 0);
  assert.equal(trip.segments.length, 0);
});

test("breaks the path at poor accuracy and rejects duplicate timestamps", () => {
  const trip = summarizeFieldTrip([point(0, 0), point(60, 0.01),
    point(60, 0.02), point(90, 0.03, { accuracy_m: 150 }), point(120, 0.04)]);
  assert.equal(trip.rejected, 2);
  assert.equal(trip.segments.length, 1);
  assert.ok(Math.abs(trip.distanceKm - 1.11195) < 0.001);
});

test("speed needs a fresh actual GPS fix and active sharing", () => {
  const unit = { is_active: true, is_sharing: true, speed_mps: 10,
    last_seen_at: new Date(start).toISOString(), last_recorded_at: new Date(start).toISOString() };
  assert.equal(currentSpeedKmh(unit, start + 10000), 36);
  assert.equal(currentSpeedKmh(unit, start + 61000), null);
  assert.equal(currentSpeedKmh({ ...unit, last_recorded_at: null }, start), null);
  assert.equal(currentSpeedKmh({ ...unit, is_sharing: false }, start), null);
  assert.equal(currentSpeedKmh({ ...unit, speed_mps: 0 }, start), 0);
});
