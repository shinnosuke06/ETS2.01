// ---------------------------------------------------------------------------
// Fuel and sleepiness (data and rules only, no DOM): how fast the tank empties and
// the driver tires, what a refuel costs, when the eyes close for a moment, and
// which service area the navigation suggests.
// ---------------------------------------------------------------------------
// burn: how much faster the tank empties than the engine's own work alone would empty it, so a full tank lasts
// about rangeKm (true km) with 15 t at 90 km/h on the flat
const CARE = { fuelL: 120, price: 140, rangeKm: 220, rescueYen: 30000, rescueL: 20, burn: 10.2 };
// fraction of a tank used per second (game time) at drive power `drive` (N) and speed v (m/s)
function fuelRate(drive, v) { return (Math.max(0, drive * v) / (0.42 * 36e6) + 0.0004) * SCALE / 600 * CARE.burn; }
// sleepiness gained per second of the game clock: 1 in 6 hours, half as fast again from 22:00 to 5:00
function sleepyRate(clockSec) {
  const h = (clockSec / 3600) % 24;
  return (h >= 22 || h < 5 ? 1.5 : 1) / (6 * 3600);
}
// real seconds to the next blink: none up to 0.85; on average 40 s just above it, 8 s at 1 (r: 0..1, evenly spread)
function blinkGap(sleepy, r) {
  if (!(sleepy > 0.85)) return Infinity;
  return lerp(40, 8, clamp((sleepy - 0.85) / 0.15, 0, 1)) * (0.5 + r);
}
// a full tank from `fuel`: litres (whole) and yen
function refuel(fuel) { const liters = Math.round((1 - clamp(fuel, 0, 1)) * CARE.fuelL); return { liters, yen: liters * CARE.price }; }
// roughly how far the fuel goes, in true km, to the nearest 10
function fuelKm(fuel) { return Math.round(clamp(fuel, 0, 1) * CARE.rangeKm / 10) * 10; }
