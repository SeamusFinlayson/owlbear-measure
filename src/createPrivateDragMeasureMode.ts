import OBR, {
  Vector2,
  isImage,
  isCurve,
  isShape,
  isLabel,
} from "@owlbear-rodeo/sdk";
import { privateRulerIcon } from "./icons";
import {
  snapPosition,
  calculateSegmentEndPosition,
  calculateDisplayDistance,
  getLabelPosition,
} from "./mathHelpers";
import { getItemId, PRIVATE_DRAG_MEASURE_MODE_ID, TOOL_ID } from "./idStrings";
import { Grid, Player, RulerIds } from "./types";
import { buildRuler } from "./rulerBuilder";

export function createPrivateDragMeasureMode(grid: Grid, player: Player) {
  let dragStarted = false;
  let interactionIsExpired = false;

  const rulerIds: RulerIds = {
    background: getItemId("background", player.id, true),
    line: getItemId("line", player.id, true),
    label: getItemId("label", player.id, true),
    endDot: getItemId("end-point", player.id, true),
  };

  // Set flags to reset interactions
  const expireAllInteractions = () => {
    // Only expire interactions if the user has started a new drag
    if (dragStarted) {
      interactionIsExpired = true;
    }
  };

  // Act on flags to reset interactions
  const stopExpiredInteractions = () => {
    if (interactionIsExpired) {
      OBR.scene.local.deleteItems(Object.values(rulerIds));

      dragStarted = false;
      interactionIsExpired = false;
    }
  };

  // State that doesn't require extra handling
  let rulerPoints: Vector2[] = []; // Points in the line being measured
  let pointerPosition: Vector2; // Track pointer position so it accessible to keyboard events
  let lastPosition: Vector2; // Memoize last position the token snapped to to prevent path measurement recalculation
  let lastLabelText: string = "";

  OBR.tool.createMode({
    id: PRIVATE_DRAG_MEASURE_MODE_ID,
    icons: [
      {
        icon: privateRulerIcon,
        label: "Private Ruler",
        filter: {
          activeTools: [TOOL_ID],
        },
      },
    ],
    cursors: [{ cursor: "crosshair" }],
    onToolDragStart: async (_, event) => {
      pointerPosition = event.pointerPosition;
      dragStarted = true;

      const startPosition = await snapPosition(
        grid,
        event.target && isImage(event.target) && !event.target.locked
          ? event.target.position
          : pointerPosition
      );
      rulerPoints = [];
      rulerPoints.push(startPosition);
      lastPosition = startPosition;

      OBR.scene.local.addItems(
        await buildRuler(
          rulerIds,
          grid,
          player,
          startPosition,
          await snapPosition(grid, pointerPosition),
          true,
          true
        )
      );

      // Because this function is asynchronous, interactions
      // may already be expired if the drag was short enough
      stopExpiredInteractions();
    },
    onToolDragMove: (_, event) => {
      pointerPosition = event.pointerPosition;
      updateToolItems();
    },
    onKeyDown: async (_, event) => {
      if (dragStarted) {
        if (event.code === "KeyZ") {
          // Add segment
          rulerPoints.push(
            await calculateSegmentEndPosition(
              grid,
              rulerPoints[rulerPoints.length - 1],
              pointerPosition
            )
          );
        }

        if (event.code === "KeyX" && rulerPoints.length > 1) {
          // Remove most recent segment
          rulerPoints.pop();
          // Refresh with segment removed
          updateToolItems(true);
        }
      }
    },
    onToolDragEnd: async () => {
      await updateToolItems();
      expireAllInteractions();
      stopExpiredInteractions();
    },
    onToolDragCancel: () => {
      expireAllInteractions();
      stopExpiredInteractions();
    },
  });

  async function updateToolItems(forceRecalculation = false) {
    const newPosition = await calculateSegmentEndPosition(
      grid,
      rulerPoints[rulerPoints.length - 1],
      pointerPosition
    );

    let labelText: string | null = null;
    if (
      !(lastPosition.x === newPosition.x && newPosition.y === lastPosition.y) ||
      forceRecalculation
    ) {
      labelText =
        "Private\n" +
        (await calculateDisplayDistance(grid, [...rulerPoints, newPosition]));
    }
    if (!labelText) {
      labelText = lastLabelText;
    }
    lastLabelText = labelText;

    if (dragStarted) {
      OBR.scene.local.updateItems(
        Object.values(rulerIds),
        items => {
          items.forEach(item => {
            if (item.id === rulerIds.line && isCurve(item)) {
              item.points = [...rulerPoints, newPosition];
            } else if (item.id === rulerIds.background && isCurve(item)) {
              item.points = [...rulerPoints, newPosition];
            } else if (item.id === rulerIds.endDot && isShape(item)) {
              item.position = newPosition;
            } else if (item.id === rulerIds.label && isLabel(item)) {
              item.position = getLabelPosition(grid, newPosition);
              item.text.plainText = labelText;
            }
          });
        },
        true,
        false
      );
    }
    lastPosition = newPosition;
  }
}
