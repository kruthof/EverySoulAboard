// The golden case registry — the single list both the regen script and the golden test walk,
// so a committed golden and its assertion can never drift apart. Each case yields a name plus
// the exact (frame, camera) fed to composeScene.

import {
  loadBootFrame, cameras, deriveLensFrame, deriveSelectionFrame, deriveLightPlane,
  firstFloorTile, cameraOn,
} from './helpers.js';

/**
 * The golden case registry. A case may carry an optional `lights` plane (the decoded LightState
 * grid); cases without it compose exactly as before (byte-identical no-lights path).
 * @returns {{name:string, frame:any, camera:any, lights?:Uint8Array}[]}
 */
export function goldenCases() {
  const boot = loadBootFrame();
  const cam = cameras(boot);

  const lensFrame = deriveLensFrame(boot);
  const selFrame = deriveSelectionFrame(boot);
  const selTile = firstFloorTile(selFrame);

  return [
    // Full view of the boot frame — every tile present; drives the fog/hull invariant.
    { name: 'boot_full', frame: boot, camera: cam.full },
    // Zoomed mid-ship subset — exercises camera culling.
    { name: 'boot_zoomed', frame: boot, camera: cam.zoomed },
    // A lens active — wash ops over explored tiles (synthetic bg on the boot frame).
    { name: 'lens_temperature', frame: lensFrame, camera: cam.zoomed },
    // Selection active — the trailing reticle op, camera centred so the tile is visible.
    { name: 'selection', frame: selFrame, camera: cameraOn(selFrame, selTile.x, selTile.y, 1.5) },
    // C4: lighting composited — a light plane over the mid-ship subset. Dead/Brownout overlays
    // land on explored tiles (below any wash), and the fog gate drops the light claimed on fog.
    { name: 'boot_lit', frame: boot, camera: cam.zoomed, lights: deriveLightPlane(boot) },
  ];
}
