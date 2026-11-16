// ---------------------------------------------------------------------------
// Fuel and sleepiness (data and rules only, no DOM): how fast the tank empties and
// the driver tires, what a refuel costs, when the eyes close for a moment, and
// which service area the navigation suggests.
// ---------------------------------------------------------------------------
// The tank: a full one lasts about rangeKm (km on the map) with 15 t at 90 km/h on the flat. The road is drawn 1:10, so
// the work against rolling and air drag counts ten times over (SCALE); the work of speeding up and climbing is not
// shortened by the map and counts once, at `extra` of its weight (a standing start then costs about what the distance
// it covers would cost at a steady speed; before, it cost 12% of a tank).
// plan: the share of rangeKm the navigation counts on; marginKm: what it keeps in hand.
const CARE = { fuelL: 120, price: 140, rangeKm: 220, rescueYen: 30000, rescueMinL: 20, rescueMaxL: 60, burn: 1.17e-9, extra: 0.5, idle: 6.8e-5, plan: 0.8, marginKm: 10 };
// fraction of a tank used per second (game time) at drive force `drive` (N), speed v (m/s), rig mass m (kg)
function fuelRate(drive, v, m = 29600) {
  const P = Math.max(0, drive * v), res = (0.0055 * m * 9.81 + 3.672 * v * v) * Math.abs(v);
  return (Math.min(P, res) * SCALE + Math.max(0, P - res) * CARE.extra) * CARE.burn + CARE.idle;
}
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
// How far (map km) the navigation counts on `fuel` going.
function fuelReach(fuel) { return clamp(fuel, 0, 1) * CARE.rangeKm * CARE.plan; }
// Map km from s to the pump after service area `sa`: the next area, or (after the last one) round the lap to the first.
function _pumpAfterKm(s, sa) {
  const nx = SAS[sa.i + 1];
  return nx ? sToKp(nx.sDiv) - sToKp(s) : sToKp(RAMPS[RAMPS.length - 1].sDiv) - sToKp(s) + SAS[0].kp;
}
// The service area the navigation suggests from s, or null: 'fuel' when the fuel would not reach the pump after that
// area with marginKm in hand, else 'sleep' at sleepiness 0.7 and over. The area is the nearest one whose divergence
// is still 160 m or more ahead, or `keep` (the one suggested before) until its lane is passed, while no other area
// lies before it. None when the destination's exit (destSDiv, at kp destKp) comes first and the fuel goes 1.2 times
// as far as that.
function saSuggest(s, fuel, sleepy, destSDiv, destKp, keep = null) {
  const first = SAS.find(a => a.sDiv + a.uSep >= s);
  const sa = keep && keep === first && s <= keep.sDiv + keep.uSep ? keep : SAS.find(a => a.sDiv - s >= 160);
  if (!sa) return null;
  const why = fuelReach(fuel) < _pumpAfterKm(s, sa) + CARE.marginKm ? 'fuel' : sleepy >= 0.7 ? 'sleep' : null;
  if (!why) return null;
  if (destSDiv < sa.sDiv && fuelReach(fuel) >= 1.2 * (destKp - sToKp(s))) return null;
  return { sa, why };
}
// Litres the rescue brings at s: enough to reach the next service area with marginKm in hand (in steps of 5 L).
function rescueLiters(s) {
  const sa = SAS.find(a => a.sDiv - s >= 160);
  const km = sa ? sToKp(sa.sDiv) - sToKp(s) : sToKp(RAMPS[RAMPS.length - 1].sDiv) - sToKp(s) + SAS[0].kp;
  const L = Math.ceil((Math.max(0, km) + CARE.marginKm) / (CARE.rangeKm * CARE.plan) * CARE.fuelL / 5) * 5;
  return clamp(L, CARE.rescueMinL, CARE.rescueMaxL);
}
