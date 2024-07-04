import OBR, {
  InteractionManager,
  Item,
  KeyFilter,
  ToolModeFilter,
  Vector2,
  buildCurve,
  buildLabel,
  isCurve,
  isImage,
  isLabel,
} from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";
import {
  Grid,
  calculateDisplayDistance,
  calculateSegmentEndPosition,
  calculateInitialPosition,
  createGrid,
} from "./mathHelpers";

const toolIcon = new URL("./toolIcon.svg#icon", import.meta.url).toString();

const TOOL_ID = getPluginId("tool");
const DRAG_MODE_ID = getPluginId("dragMode");

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
  const [dpi, type, measurement, scale] = await Promise.all([
    await OBR.scene.grid.getDpi(),
    await OBR.scene.grid.getType(),
    await OBR.scene.grid.getMeasurement(),
    await OBR.scene.grid.getScale(),
  ]);

  const grid = createGrid(dpi, type, measurement, scale);

  startCallbacks(grid);
  createTool();
  createToolMode(grid);
}

async function startCallbacks(grid: Grid) {
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

    // Unsubscribe listeners that rely on the scene if it stops being ready
    const unsubscribeFromScene = OBR.scene.onReadyChange(isReady => {
      if (!isReady) {
        unsubscribeFromGrid();
        unsubscribeFromScene();
        callbacksStarted = false;
      }
    });
  }
}

function createTool() {
  OBR.tool.create({
    id: TOOL_ID,
    icons: [
      {
        icon: toolIcon,
        label: "Segmentable Ruler",
      },
    ],
    shortcut: "Z",
  });
}

function createToolMode(grid: Grid) {
  let itemInteraction: InteractionManager<Item[]> | null = null;
  let interactionIsExpired = false;

  // Ruler item IDs
  const RULER_LINE_ID = getPluginId("rulerLineId");
  const RULER_LABEL_ID = getPluginId("measureLabelId");

  // Set flags to reset interactions
  const expireAllInteractions = () => {
    interactionIsExpired = true;
  };

  // Act on flags to reset interactions
  const stopExpiredInteractions = () => {
    if (itemInteraction && interactionIsExpired) {
      itemInteraction[1]();
      itemInteraction = null;
      interactionIsExpired = false;
    }
  };

  // State that doesn't require extra handling
  let initialInteractedItem: Item | null = null;
  let initialSharedItemAttachments: Item[] = [];
  let initialLocalItemAttachments: Item[] = [];
  let rulerPoints: Vector2[] = []; // Points in the line being measured
  let pointerPosition: Vector2; // Track pointer position so it accessible to keyboard events
  let lastPosition: Vector2; // Memoize last position the token snapped to to prevent path measurement recalculation

  //TODO: Fix dragging and cursor on grid with no map
  const locked: KeyFilter = { key: "locked", value: true, operator: "==" };
  const invalidTargets: ToolModeFilter = {
    target: [
      {
        key: "layer",
        value: "CHARACTER",
        operator: "!=",
        coordinator: "&&",
      },
      { key: "layer", value: "MOUNT", operator: "!=", coordinator: "||" },
      { key: "locked", value: true, operator: "==" },
    ],
    dragging: true,
  };

  OBR.tool.createMode({
    id: DRAG_MODE_ID,
    icons: [
      {
        icon: toolIcon,
        label: "Drag Measure",
        filter: {
          activeTools: [TOOL_ID],
        },
      },
    ],
    cursors: [
      { cursor: "move", filter: { target: [locked] } },
      {
        cursor: "pointer",
        filter: {
          target: [
            {
              key: "layer",
              value: "CHARACTER",
              operator: "!=",
              coordinator: "&&",
            },
            { key: "layer", value: "MOUNT", operator: "!=" },
          ],
        },
      },
      { cursor: "grab" },
    ],
    preventDrag: invalidTargets,
    onToolDragStart: async (_, event) => {
      pointerPosition = event.pointerPosition;
      const token = event.target;

      if (
        token &&
        isImage(token) &&
        !token.locked &&
        (token.layer == "CHARACTER" || token.layer === "MOUNT")
      ) {
        initialInteractedItem = token;
        const startPosition = await calculateInitialPosition(grid, token);
        lastPosition = startPosition;
        rulerPoints = [];
        rulerPoints.push(startPosition);

        [
          itemInteraction,
          initialSharedItemAttachments,
          initialLocalItemAttachments,
        ] = await Promise.all([
          OBR.interaction.startItemInteraction(
            [
              buildCurve()
                .points(rulerPoints)
                .strokeColor("grey")
                .fillOpacity(0)
                .strokeWidth(grid.dpi / 10)
                .strokeDash([grid.dpi / 5])
                .tension(0)
                .visible(token.visible)
                .layer("RULER")
                .id(RULER_LINE_ID)
                .build(),
              buildLabel()
                .position(startPosition)
                .plainText(
                  await calculateDisplayDistance(grid, [
                    startPosition,
                    startPosition,
                  ])
                )
                .pointerHeight(0)
                .visible(token.visible)
                .layer("RULER")
                .id(RULER_LABEL_ID)
                .build(),
              token,
            ],
            false
          ),
          OBR.scene.items.getItemAttachments([token.id]),
          OBR.scene.local.getItemAttachments([token.id]),
        ]);

        // Because this function is asynchronous, interactions
        // may already be expired if the drag was short enough
        stopExpiredInteractions();
      }
    },
    onToolDragMove: (_, event) => {
      if (initialInteractedItem) {
        pointerPosition = event.pointerPosition;
        updateToolItems();
      }
    },
    onKeyDown: async (_, event) => {
      if (initialInteractedItem) {
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
          updateToolItems();
        }
      }
    },
    onToolDragEnd: async (_, event) => {
      if (initialInteractedItem) {
        if (itemInteraction) {
          updateToolItems();

          const newPosition = await calculateSegmentEndPosition(
            grid,
            rulerPoints[rulerPoints.length - 1],
            event.pointerPosition
          );

          const positionChange = {
            x: newPosition.x - initialInteractedItem.position.x,
            y: newPosition.y - initialInteractedItem.position.y,
          };

          // Update dragged item and shared attachments
          for (let i = 0; i < initialSharedItemAttachments.length; i++) {
            initialSharedItemAttachments[i].position.x += positionChange.x;
            initialSharedItemAttachments[i].position.y += positionChange.y;
          }
          OBR.scene.items.addItems(initialSharedItemAttachments);

          // Update local attachments
          for (let i = 0; i < initialLocalItemAttachments.length; i++) {
            initialLocalItemAttachments[i].position.x += positionChange.x;
            initialLocalItemAttachments[i].position.y += positionChange.y;
          }
          OBR.scene.local.addItems(initialLocalItemAttachments);
        }

        expireAllInteractions();
        stopExpiredInteractions();
        initialInteractedItem = null;
      }
    },
    onToolDragCancel: () => {
      if (initialInteractedItem) {
        // Fix bug where token is not locally displayed at its initial position on cancel
        if (itemInteraction) {
          itemInteraction[0](items => {
            items.forEach(item => {
              if (initialInteractedItem && item.id === initialInteractedItem.id)
                item.position = initialInteractedItem.position;
            });
          });
        }

        expireAllInteractions();
        stopExpiredInteractions();
        initialInteractedItem = null;
      }
    },
  });

  async function updateToolItems() {
    const newPosition = await calculateSegmentEndPosition(
      grid,
      rulerPoints[rulerPoints.length - 1],
      pointerPosition
    );

    let updateText = false;
    let newText: string;
    if (
      !(lastPosition.x === newPosition.x && newPosition.y === lastPosition.y)
    ) {
      updateText = true;
      newText = await calculateDisplayDistance(grid, [
        ...rulerPoints,
        newPosition,
      ]);
    }
    lastPosition = newPosition;

    // const newText = "hello";
    if (itemInteraction) {
      itemInteraction[0](items => {
        items.forEach(item => {
          if (initialInteractedItem && item.id === initialInteractedItem.id) {
            item.position = newPosition;
          } else if (item.id === RULER_LINE_ID && isCurve(item)) {
            item.points = [...rulerPoints, newPosition];
          } else if (item.id === RULER_LABEL_ID && isLabel(item)) {
            item.position = newPosition;
            if (!updateText) newText = item.text.plainText;
            item.text.plainText = newText;
          }
        });
      });
    }
  }
}
