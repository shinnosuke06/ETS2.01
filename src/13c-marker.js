// ---------------------------------------------------------------------------
// The destination marker: over the gate of the warehouse the load goes to, a
// column of light seen from afar, a bobbing arrow and a 「配送先」 board. It
// shows while the destination town is loaded and the tractor is not yet in
// the yard (it comes back if the rig drives out again before delivering).
// ---------------------------------------------------------------------------
const DEST_MARK = { grp: null, arrow: null, board: null, t: 0, shown: false };
function _destMarkMake() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 34, 28, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x3fc4ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  beam.position.y = 17; beam.renderOrder = 5; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6.2, 40), new THREE.MeshBasicMaterial({ color: 0x3fc4ff, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.0, 4), new THREE.MeshBasicMaterial({ color: 0xffc21c, fog: false }));
  arrow.rotation.x = Math.PI; g.add(arrow);
  const c = makeCanvas(256, 96), x = c.getContext('2d');
  x.fillStyle = '#ffc21c'; roundRect(x, 4, 4, 248, 88, 16); x.fill();
  x.fillStyle = '#1a1a1a'; x.font = font(56); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('配送先', 128, 50);
  const board = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c, { aniso: 4 }), fog: false, depthWrite: false }));
  board.scale.set(6.4, 2.4, 1); g.add(board);
  g.traverse(o => { if (o.geometry) o.geometry.userData.keep = true; });
  g.visible = false; scene.add(g);
  DEST_MARK.grp = g; DEST_MARK.arrow = arrow; DEST_MARK.board = board;
}
// Is the tractor's front inside warehouse w's yard (town i), or so near the column that the cab would be in it?
function _destInYard(i, w) {
  const f = RIGP.front, q = {}, g = w.gate;
  townUV(TOWN_SITES[i], TR.x + Math.sin(TR.h) * f, TR.z + Math.cos(TR.h) * f, q);
  const y = w.yard; if (q.u >= y.u0 && q.u <= y.u1 && q.v >= y.v0 && q.v <= y.v1) return true;
  return Math.hypot(q.u - (g.u + g.nu * 3), q.v - (g.v + g.nv * 3)) < 8;
}
function destMarkUpdate(dt) {
  const j = GAME.job, show = (GAME.state === 'drive' || GAME.state === 'stop') && !!j && !!j.whB && TOWNS_LOADED.has(j.to) && !_destInYard(j.to, j.whB);
  if (!show) { if (DEST_MARK.grp && DEST_MARK.shown) { DEST_MARK.grp.visible = false; DEST_MARK.shown = false; } return; }
  if (!DEST_MARK.grp) _destMarkMake();
  const site = TOWN_SITES[j.to], gt = j.whB.gate, q = {};
  townXZ(site, gt.u + gt.nu * 3, gt.v + gt.nv * 3, q);   // just inside the gate
  DEST_MARK.t += dt;
  const bob = Math.sin(DEST_MARK.t * 2.4) * 0.6;
  DEST_MARK.grp.position.set(q.x, townHeight(site, gt.u, gt.v), q.z);
  DEST_MARK.arrow.position.y = 9 + bob; DEST_MARK.board.position.y = 13 + bob;
  DEST_MARK.arrow.rotation.y = DEST_MARK.t * 1.2;
  DEST_MARK.grp.visible = true; DEST_MARK.shown = true;
}
