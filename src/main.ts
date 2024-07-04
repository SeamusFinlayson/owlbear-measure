import OBR, {
  Curve,
  InteractionManager,
  Item,
  KeyEvent,
  Label,
  ToolContext,
  ToolEvent,
  ToolModeFilter,
  Vector2,
  buildCurve,
  buildLabel,
  isImage,
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
  const grid = createGrid(
    await OBR.scene.grid.getDpi(),
    await OBR.scene.grid.getScale(),
    await OBR.scene.grid.getMeasurement()
  );

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
        await OBR.scene.grid.getScale(),
        newGrid.measurement
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
  // Interactions
  let curveInteraction: InteractionManager<Curve> | null = null;
  let labelInteraction: InteractionManager<Label> | null = null;
  let itemInteraction: InteractionManager<Item> | null = null;

  // Track interaction state
  let curveIsExpired = false;
  let labelIsExpired = false;
  let itemIsExpired = false;

  // Set flags to reset interactions
  const expireAllInteractions = () => {
    curveIsExpired = true;
    labelIsExpired = true;
    itemIsExpired = true;
  };

  // Act on flags to reset interactions
  const stopExpiredInteractions = () => {
    if (curveInteraction && curveIsExpired) {
      curveInteraction[1]();
      curveInteraction = null;
      curveIsExpired = false;
    }
    if (labelInteraction && labelIsExpired) {
      labelInteraction[1]();
      labelInteraction = null;
      labelIsExpired = false;
    }
    if (itemInteraction && itemIsExpired) {
      itemInteraction[1]();
      itemInteraction = null;
      itemIsExpired = false;
    }
  };

  // State that doesn't require extra handling
  let initialInteractedItem: Item | null = null;
  let initialSharedItemAttachments: Item[] = [];
  let initialLocalItemAttachments: Item[] = [];
  let linePoints: Vector2[] = [];
  let pointerPosition: Vector2;

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
    cursors: [{ cursor: "move", filter: invalidTargets }, { cursor: "grab" }],
    preventDrag: invalidTargets,
    onToolDragStart: async (_context: ToolContext, event: ToolEvent) => {
      console.log("start");

      pointerPosition = event.pointerPosition;
      const token = event.target;

      if (
        token &&
        isImage(token) &&
        !token.locked &&
        (token.layer == "CHARACTER" || token.layer === "MOUNT")
      ) {
        initialInteractedItem = token;
        const startPosition = calculateInitialPosition(grid, token);
        linePoints = [];
        linePoints.push(startPosition);

        [
          curveInteraction,
          labelInteraction,
          itemInteraction,
          initialSharedItemAttachments,
          initialLocalItemAttachments,
        ] = await Promise.all([
          OBR.interaction.startItemInteraction(
            buildCurve()
              .points(linePoints)
              .strokeColor("white")
              .fillOpacity(0)
              .strokeColor("gray")
              .strokeWidth(grid.dpi / 10)
              .strokeDash([grid.dpi / 5])
              .tension(0)
              .visible(token.visible)
              .layer("RULER")
              .build()
          ),
          OBR.interaction.startItemInteraction(
            buildLabel()
              .position(startPosition)
              .plainText(
                calculateDisplayDistance(grid, [
                  startPosition,
                  event.pointerPosition,
                ]).toString()
              )
              .pointerHeight(0)
              .visible(token.visible)
              .layer("RULER")
              .build()
          ),
          OBR.interaction.startItemInteraction(token, false),
          OBR.scene.items.getItemAttachments([token.id]),
          OBR.scene.local.getItemAttachments([token.id]),
        ]);

        // Because this function is asynchronous, interactions
        // may already be expired if the drag was short enough
        stopExpiredInteractions();
      }
    },
    onToolDragMove: (_context: ToolContext, event: ToolEvent) => {
      if (initialInteractedItem) {
        console.log("move");

        pointerPosition = event.pointerPosition;

        // Calculate new position
        const newPosition = calculateSegmentEndPosition(
          grid,
          linePoints[linePoints.length - 1],
          event.pointerPosition
        );

        // Update item position
        if (itemInteraction) {
          const [update] = itemInteraction;
          update(item => {
            item.position = newPosition;
          });
        }

        // Update path drawing
        if (curveInteraction) {
          const [update] = curveInteraction;
          update(curve => {
            curve.points = [...linePoints, newPosition];
          });
        }

        // Update label text and position
        if (labelInteraction) {
          const [update] = labelInteraction;
          const newText = calculateDisplayDistance(grid, [
            ...linePoints,
            event.pointerPosition,
          ]).toString();
          update(label => {
            label.text.plainText = newText;
            label.position = newPosition;
          });
        }
      }
    },
    onKeyDown: (_context: ToolContext, event: KeyEvent) => {
      if (initialInteractedItem) {
        if (event.code === "KeyZ") {
          // Add segment
          linePoints.push(
            calculateSegmentEndPosition(
              grid,
              linePoints[linePoints.length - 1],
              pointerPosition
            )
          );
        }

        if (event.code === "KeyX" && linePoints.length > 1) {
          // Remove most recent segment
          linePoints.pop();

          // Update curve
          if (curveInteraction) {
            const [update] = curveInteraction;
            update(curve => {
              curve.points = [
                ...linePoints,
                calculateSegmentEndPosition(
                  grid,
                  linePoints[linePoints.length - 1],
                  pointerPosition
                ),
              ];
            });
          }

          // Update label
          if (labelInteraction) {
            const [update] = labelInteraction;
            update(label => {
              label.text.plainText = calculateDisplayDistance(grid, [
                ...linePoints,
                pointerPosition,
              ]).toString();
              label.position = calculateSegmentEndPosition(
                grid,
                linePoints[0],
                pointerPosition
              );
            });
          }
        }
      }
    },
    async onToolDragEnd(_, event) {
      if (initialInteractedItem) {
        console.log("end");

        // TODO: idk if this does anything, maybe get rid of it
        if (curveInteraction) {
          const [update] = curveInteraction;
          update(curve => {
            curve.points = [
              ...linePoints,
              calculateSegmentEndPosition(
                grid,
                linePoints[linePoints.length - 1],
                event.pointerPosition
              ),
            ];
          });
        }
        if (itemInteraction) {
          const [update] = itemInteraction;
          const item = update(item => {
            item.position = calculateSegmentEndPosition(
              grid,
              linePoints[linePoints.length - 1],
              event.pointerPosition
            );
          });

          // Overwrite the initial item with a new item with the correct position
          OBR.scene.items.addItems([item]);

          // Calculate position change
          const positionChange = {
            x: item.position.x - initialInteractedItem.position.x,
            y: item.position.y - initialInteractedItem.position.y,
          };

          // Update shared attachments
          for (let i = 0; i < initialSharedItemAttachments.length; i++) {
            if (initialSharedItemAttachments[i].id === item.id) {
              initialSharedItemAttachments.splice(i, 1);
            }
            if (i < initialSharedItemAttachments.length) {
              initialSharedItemAttachments[i].position.x += positionChange.x;
              initialSharedItemAttachments[i].position.y += positionChange.y;
            }
          }
          OBR.scene.items.addItems(initialSharedItemAttachments);

          // Update local attachments
          for (let i = 0; i < initialLocalItemAttachments.length; i++) {
            if (i < initialLocalItemAttachments.length) {
              initialLocalItemAttachments[i].position.x += positionChange.x;
              initialLocalItemAttachments[i].position.y += positionChange.y;
            }
          }
          OBR.scene.local.addItems(initialLocalItemAttachments);
        }
      }

      expireAllInteractions();
      stopExpiredInteractions();
      initialInteractedItem = null;
    },
    onToolDragCancel() {
      if (initialInteractedItem) {
        console.log("cancel");

        expireAllInteractions();
        stopExpiredInteractions();
        initialInteractedItem = null;
      }
    },
  });
}
