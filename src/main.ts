import OBR, {
  InteractionManager,
  Item,
  Vector2,
  buildCurve,
  buildLabel,
  buildShape,
  isCurve,
  isImage,
  isLabel,
  isShape,
} from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";
import {
  Grid,
  calculateDisplayDistance,
  calculateSegmentEndPosition,
  calculateInitialPosition,
  createGrid,
  getLabelPosition,
} from "./mathHelpers";

const toolIcon = new URL("./toolIcon.svg#icon", import.meta.url).toString();
const deleteActionIcon = new URL(
  "./clearRulersActionIcon.svg#icon",
  import.meta.url
).toString();

const TOOL_ID = getPluginId("tool");
const DRAG_MODE_ID = getPluginId("dragMode");
const DELETE_ACTION_ID = getPluginId("deleteAction");

interface Player {
  id: string;
  color: string;
  role: "GM" | "PLAYER";
}

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
  createTool();
  createToolMode(grid, player);
  createDeleteButton(player);
}

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
      createDeleteButton(player);
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

function createDeleteButton(player: Player) {
  if (player.role === "GM") {
    OBR.tool.createAction({
      id: DELETE_ACTION_ID,
      icons: [
        {
          icon: deleteActionIcon,
          label: "Clear Rulers",
          filter: {
            activeTools: [TOOL_ID],
          },
        },
      ],
      onClick: async () => {
        const items = await OBR.scene.items.getItems(
          item => item.layer === "RULER"
        );
        const deleteList: string[] = [];
        for (let item of items) {
          if (item.id.startsWith("segmented-ruler", 0))
            deleteList.push(item.id);
        }
        OBR.scene.items.deleteItems(deleteList);
      },
    });
  } else {
    OBR.tool.removeAction(DELETE_ACTION_ID);
  }
}

function createToolMode(grid: Grid, player: Player) {
  let itemInteraction: InteractionManager<Item[]> | null = null;
  let interactionStarted = false;
  let interactionIsExpired = false;

  // Ruler item IDs
  const getItemId = (name: string, playerId: string) =>
    `segmented-ruler-${name}-${playerId}`;
  const RULER_LINE_ID = getItemId("line", player.id);
  const RULER_BACKGROUND_ID = getItemId("background", player.id);
  const RULER_LABEL_ID = getItemId("label", player.id);
  const RULER_END_POINT_ID = getItemId("end-point", player.id);
  const rulerIds = [
    RULER_BACKGROUND_ID,
    RULER_LINE_ID,
    RULER_LABEL_ID,
    RULER_END_POINT_ID,
  ];

  // Set flags to reset interactions
  const expireAllInteractions = () => {
    if (interactionStarted) {
      interactionIsExpired = true;
    }
  };

  // Act on flags to reset interactions
  const stopExpiredInteractions = () => {
    if (itemInteraction && interactionIsExpired) {
      itemInteraction[1]();
      itemInteraction = null;
      interactionStarted = false;
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
      {
        cursor: "grab",
        filter: {
          target: [
            { key: "locked", value: true, operator: "!=" },
            { key: "image", value: undefined, operator: "!=" },
          ],
        },
      },
      { cursor: "crosshair" },
    ],
    onToolDragStart: async (_, event) => {
      pointerPosition = event.pointerPosition;

      interactionStarted = true;
      OBR.scene.items.deleteItems(rulerIds);

      const token = event.target;
      if (token && isImage(token) && !token.locked) {
        initialInteractedItem = token;
        const startPosition = await calculateInitialPosition(
          grid,
          token.position
        );
        lastPosition = startPosition;
        rulerPoints = [];
        rulerPoints.push(startPosition);

        [
          itemInteraction,
          initialSharedItemAttachments,
          initialLocalItemAttachments,
        ] = await Promise.all([
          OBR.interaction.startItemInteraction(
            [...(await buildRuler(startPosition, token.visible)), token],
            false
          ),
          OBR.scene.items.getItemAttachments([token.id]),
          OBR.scene.local.getItemAttachments([token.id]),
        ]);
      } else {
        const startPosition = await calculateInitialPosition(
          grid,
          pointerPosition
        );
        lastPosition = startPosition;
        rulerPoints = [];
        rulerPoints.push(startPosition);

        [itemInteraction] = await Promise.all([
          OBR.interaction.startItemInteraction(
            [
              ...(await buildRuler(startPosition, true)),
              buildShape()
                .id(RULER_END_POINT_ID)
                .attachedTo(RULER_LABEL_ID)
                .layer("RULER")
                .position(startPosition)
                .shapeType("CIRCLE")
                .fillColor(player.color)
                .strokeColor("white")
                .strokeOpacity(0.03)
                .strokeWidth(grid.dpi / 120)
                .width(grid.dpi / 4)
                .height(grid.dpi / 4)
                .zIndex(10001)
                .disableHit(true)
                .build(),
            ],
            false
          ),
        ]);
      }

      // Because this function is asynchronous, interactions
      // may already be expired if the drag was short enough
      stopExpiredInteractions();
    },
    onToolDragMove: (_, event) => {
      pointerPosition = event.pointerPosition;
      updateToolItems();
      // OBR.player.deselect();
    },
    onKeyDown: async (_, event) => {
      if (itemInteraction || true) {
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

        if (event.code === "Enter") {
          // Run final update
          const items = await updateToolItems();
          await updateInteractionTargetItems(pointerPosition);

          // Add ruler to the scene
          const ruler: Item[] = [];
          for (let rulerId of rulerIds) {
            for (let item of items) {
              if (item.id === rulerId) {
                ruler.push(item);
                break;
              }
            }
          }
          OBR.scene.items.addItems(ruler);

          expireAllInteractions();
          stopExpiredInteractions();
          initialInteractedItem = null;
        }
      }
    },
    onToolDragEnd: async (_, event) => {
      await updateToolItems();
      await updateInteractionTargetItems(event.pointerPosition);

      expireAllInteractions();
      stopExpiredInteractions();
      initialInteractedItem = null;
    },
    onToolDragCancel: () => {
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
    },
  });

  async function updateInteractionTargetItems(pointerPosition: Vector2) {
    if (itemInteraction && initialInteractedItem) {
      const newPosition = await calculateSegmentEndPosition(
        grid,
        rulerPoints[rulerPoints.length - 1],
        pointerPosition
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
  }

  async function updateToolItems(): Promise<Item[]> {
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

    let items: Item[] = [];
    if (itemInteraction) {
      items = itemInteraction[0](items => {
        items.forEach(item => {
          if (initialInteractedItem && item.id === initialInteractedItem.id) {
            item.position = newPosition;
          } else if (item.id === RULER_LINE_ID && isCurve(item)) {
            item.points = [...rulerPoints, newPosition];
          } else if (item.id === RULER_BACKGROUND_ID && isCurve(item)) {
            item.points = [...rulerPoints, newPosition];
          } else if (item.id === RULER_END_POINT_ID && isShape(item)) {
            item.position = newPosition;
          } else if (item.id === RULER_LABEL_ID && isLabel(item)) {
            item.position = getLabelPosition(grid, newPosition);
            if (!updateText) newText = item.text.plainText;
            item.text.plainText = newText;
          }
        });
      });
    }

    return items;
  }

  async function buildRuler(
    startPosition: Vector2,
    visible: boolean
  ): Promise<Item[]> {
    return [
      buildCurve()
        .id(RULER_BACKGROUND_ID)
        .attachedTo(RULER_LABEL_ID)
        .points(rulerPoints)
        .strokeColor("white")
        .strokeOpacity(0.2)
        .fillOpacity(0)
        .strokeWidth(grid.dpi / 8)
        .tension(0)
        .visible(visible)
        .layer("RULER")
        .zIndex(10000)
        .build(),
      buildCurve()
        .id(RULER_LINE_ID)
        .attachedTo(RULER_BACKGROUND_ID)
        .points(rulerPoints)
        .strokeColor(player.color)
        .fillOpacity(0)
        .strokeWidth(grid.dpi / 15)
        .strokeDash([grid.dpi / 3, grid.dpi / 5])
        .tension(0)
        .visible(visible)
        .layer("RULER")
        .zIndex(10002)
        .build(),
      buildLabel()
        .id(RULER_LABEL_ID)
        .attachedTo(RULER_LINE_ID)
        .position(getLabelPosition(grid, startPosition))
        .plainText(
          await calculateDisplayDistance(grid, [startPosition, startPosition])
        )
        .pointerHeight(0)
        .visible(visible)
        .layer("RULER")
        .zIndex(10003)
        .build(),
    ];
  }
}
