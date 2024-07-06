import OBR from "@owlbear-rodeo/sdk";
import { createGrid } from "./types";
import { Grid } from "./types";
import { Player } from "./types";
import { createClearRulersAction } from "./createClearRulersAction";
import { createDragMeasureMode } from "./createDragMeasureMode";
import { createSegmentableRulerTool } from "./createSegmentableRulerTool";
import { createPrivateDragMeasureMode } from "./createPrivateDragMeasureMode";

OBR.onReady(async () => {
  printVersionToConsole();
  startWhenSceneIsReady();
});

async function printVersionToConsole() {
  fetch("/manifest.json")
    .then(response => response.json())
    .then(json => console.log(json["name"] + " - version: " + json["version"]));
}

async function startWhenSceneIsReady() {
  // Handle when the scene is either changed or made ready after extension load
  OBR.scene.onReadyChange(async isReady => {
    if (isReady) start();
  });

  // Check if the scene is already ready once the extension loads
  const isReady = await OBR.scene.isReady();
  if (isReady) start();
}

async function start() {
  const [
    gridDpi,
    gridType,
    gridMeasurement,
    gridScale,
    playerId,
    playerColor,
    playerRole,
  ] = await Promise.all([
    OBR.scene.grid.getDpi(),
    OBR.scene.grid.getType(),
    OBR.scene.grid.getMeasurement(),
    OBR.scene.grid.getScale(),
    OBR.player.getId(),
    OBR.player.getColor(),
    OBR.player.getRole(),
  ]);
  const grid = createGrid(gridDpi, gridType, gridMeasurement, gridScale);

  const player: Player = { id: playerId, color: playerColor, role: playerRole };

  startCallbacks(grid, player);
  createSegmentableRulerTool();
  createDragMeasureMode(grid, player);
  createPrivateDragMeasureMode(grid, player);
  createClearRulersAction(player);
}

// Keep passed objects up to date with the scene
async function startCallbacks(grid: Grid, player: Player) {
  let callbacksStarted = false;
  if (!callbacksStarted) {
    callbacksStarted = true;

    const unsubscribeFromGrid = OBR.scene.grid.onChange(async newGrid => {
      grid.update(
        newGrid.dpi,
        newGrid.type,
        newGrid.measurement,
        await OBR.scene.grid.getScale()
      );
    });

    const unsubscribeFromPlayer = OBR.player.onChange(async newPlayer => {
      player.id = newPlayer.id;
      player.color = newPlayer.color;
      player.role = newPlayer.role;
      createClearRulersAction(player);
    });

    // Unsubscribe listeners that rely on the scene if it stops being ready
    const unsubscribeFromScene = OBR.scene.onReadyChange(isReady => {
      if (!isReady) {
        unsubscribeFromGrid();
        unsubscribeFromPlayer();
        unsubscribeFromScene();
        callbacksStarted = false;
      }
    });
  }
}
