import OBR, {
  Curve,
  GridScale,
  Image,
  InteractionManager,
  Item,
  KeyEvent,
  Label,
  ToolContext,
  ToolEvent,
  Vector2,
  buildCurve,
  buildLabel,
  isImage,
} from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";

const toolIcon = new URL("./vite.svg#icon", import.meta.url).toString();
const toolId = getPluginId("tool");
const modeId = getPluginId("mode");

let gridDpi: number = 150;
let gridScale: GridScale = {
  raw: "5ft",
  parsed: {
    multiplier: 5,
    unit: "ft",
    digits: 0,
  },
};

OBR.onReady(async () => {
  console.log("OBR ready");
  setUpWhenSceneReady();
});

async function setUpWhenSceneReady() {
  const start = async () => {
    gridDpi = await OBR.scene.grid.getDpi();
    gridScale = await OBR.scene.grid.getScale();
    startCallbacks();

    createTool();
    createToolMode();
  };

  // Handle when the scene is either changed or made ready after extension load
  OBR.scene.onReadyChange(async isReady => {
    if (isReady) start();
  });

  // Check if the scene is already ready once the extension loads
  const isReady = await OBR.scene.isReady();
  if (isReady) start();
}

let callbacksStarted = false;
async function startCallbacks() {
  if (!callbacksStarted) {
    callbacksStarted = true;
  }

  const unsubscribeFromGrid = OBR.scene.grid.onChange(async grid => {
    gridDpi = grid.dpi;
    gridScale = await OBR.scene.grid.getScale();
    console.log("update");
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

function createTool() {
  OBR.tool.create({
    id: toolId,
    icons: [
      {
        icon: toolIcon,
        label: "Measure++",
      },
    ],
    shortcut: "Z",
  });
}

function createToolMode() {
  let curveInteraction: InteractionManager<Curve> | null = null;
  let labelInteraction: InteractionManager<Label> | null = null;
  let itemInteraction: InteractionManager<Item> | null = null;
  let initialInteractedItem: Item | null = null;
  let linePoints: Vector2[] | null = null;
  let pointerPosition: Vector2 | null = null;

  const resetState = () => {
    curveInteraction = null;
    labelInteraction = null;
    itemInteraction = null;
    initialInteractedItem = null;
    linePoints = null;
    pointerPosition = null;
  };

  OBR.tool.createMode({
    id: modeId,
    icons: [
      {
        icon: toolIcon,
        label: "Drag Measure",
        filter: {
          activeTools: [toolId],
        },
      },
    ],
    onToolDragStart: async (_context: ToolContext, event: ToolEvent) => {
      pointerPosition = event.pointerPosition;
      const token = event.target;
      if (token && isImage(token)) {
        initialInteractedItem = token;
        const startPosition = calculateStartPosition(token);
        linePoints = [];
        linePoints.push(startPosition);

        curveInteraction = await OBR.interaction.startItemInteraction(
          buildCurve()
            .points([startPosition])
            .strokeColor("white")
            .fillOpacity(0)
            .strokeColor("gray")
            .strokeWidth(gridDpi / 10)
            .strokeDash([gridDpi / 5])
            .tension(0)
            .visible(token.visible)
            .layer("RULER")
            .build()
        );

        labelInteraction = await OBR.interaction.startItemInteraction(
          buildLabel()
            .position(startPosition)
            .plainText(
              calculateDisplayDistance([
                ...linePoints,
                event.pointerPosition,
              ]).toString()
            )
            .pointerHeight(0)
            .visible(token.visible)
            .layer("RULER")
            .build()
        );

        itemInteraction = await OBR.interaction.startItemInteraction(token);
      }
    },
    onToolDragMove: async (_context: ToolContext, event: ToolEvent) => {
      pointerPosition = event.pointerPosition;

      if (linePoints === null) return;
      const newPosition = calculateSegmentEndPosition(
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
          if (linePoints === null) return;
          curve.points = [...linePoints, newPosition];
        });
      }

      // Update label text and position
      if (labelInteraction) {
        const [update] = labelInteraction;
        const newText = calculateDisplayDistance([
          ...linePoints,
          event.pointerPosition,
        ]).toString();
        update(label => {
          if (linePoints === null) return;
          label.text.plainText = newText;
          label.position = newPosition;
        });
      }
    },
    onKeyDown: (_context: ToolContext, event: KeyEvent) => {
      if (event.code === "KeyZ") {
        if (linePoints === null) return;
        if (pointerPosition === null) return;
        linePoints.push(
          calculateSegmentEndPosition(
            linePoints[linePoints.length - 1],
            pointerPosition
          )
        );
      }
      if (linePoints === null) return;
      if (event.code === "KeyX" && linePoints.length > 1) {
        linePoints.pop();
        if (curveInteraction) {
          const [update] = curveInteraction;
          update(curve => {
            if (linePoints === null) return;
            if (pointerPosition === null) return;
            curve.points = [
              ...linePoints,
              calculateSegmentEndPosition(
                linePoints[linePoints.length - 1],
                pointerPosition
              ),
            ];
          });
        }
      }
      if (labelInteraction) {
        const [update] = labelInteraction;
        update(label => {
          if (linePoints === null) return;
          if (pointerPosition === null) return;
          label.text.plainText = calculateDisplayDistance([
            ...linePoints,
            pointerPosition,
          ]).toString();
          label.position = calculateSegmentEndPosition(
            linePoints[0],
            pointerPosition
          );
        });
      }
    },
    onToolDragEnd(_, event) {
      if (curveInteraction) {
        const [update, stop] = curveInteraction;
        update(curve => {
          if (linePoints === null) return;
          curve.points = [
            ...linePoints,
            calculateSegmentEndPosition(
              linePoints[linePoints.length - 1],
              event.pointerPosition
            ),
          ];
        });
        stop();
      }
      if (labelInteraction) {
        const [_, stop] = labelInteraction;
        stop();
      }
      if (itemInteraction) {
        const [update, stop] = itemInteraction;
        const item = update(item => {
          if (linePoints === null) return;
          item.position = calculateSegmentEndPosition(
            linePoints[linePoints.length - 1],
            event.pointerPosition
          );
        });

        // Overwrite the initial item with a new item with the correct position
        OBR.scene.items.addItems([item]);

        stop();
      }

      resetState();
    },
    onToolDragCancel() {
      // Stop the interaction early if we cancel the drag
      // This can happen if the user presses `esc` in the middle
      // of a drag operation
      if (curveInteraction) {
        const [_, stop] = curveInteraction;
        stop();
      }
      if (labelInteraction) {
        const [_, stop] = labelInteraction;
        stop();
      }
      if (itemInteraction) {
        const [_, stop] = itemInteraction;
        if (initialInteractedItem !== null)
          OBR.scene.items.addItems([initialInteractedItem]);
        stop();
      }

      resetState();
    },
    preventDrag: {
      target: [
        { key: "layer", value: "CHARACTER", operator: "!=", coordinator: "&&" },
        { key: "layer", value: "MOUNT", operator: "!=" },
      ],
    },
  });
}

// Chessboard (D&D 5E) measurement
function calculateDisplayDistance(points: Vector2[]): string {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += Math.max(
      Math.abs(Math.round((points[i].x - points[i - 1].x) / gridDpi)),
      Math.abs(Math.round((points[i].y - points[i - 1].y) / gridDpi))
    );
    // distance += await OBR.scene.grid.getDistance(points[i], points[i - 1]); // takes too long
  }
  return `${distance * gridScale.parsed.multiplier}${gridScale.parsed.unit}`;
}

function calculateSegmentEndPosition(
  startPosition: Vector2,
  endPosition: Vector2
): Vector2 {
  return {
    x:
      startPosition.x +
      Math.round((endPosition.x - startPosition.x) / gridDpi) * gridDpi,
    y:
      startPosition.y +
      Math.round((endPosition.y - startPosition.y) / gridDpi) * gridDpi,
  };
}

function calculateStartPosition(token: Image): Vector2 {
  const nearestCenter = {
    x: Math.round((token.position.x + 75) / gridDpi) * gridDpi - 75,
    y: Math.round((token.position.y + 75) / gridDpi) * gridDpi - 75,
  };
  const nearestVertex = {
    x: Math.round(token.position.x / gridDpi) * gridDpi,
    y: Math.round(token.position.y / gridDpi) * gridDpi,
  };
  if (
    distance(token.position, nearestVertex) <
    distance(token.position, nearestCenter)
  ) {
    return nearestVertex;
  }
  return nearestCenter;
}

function distance(point1: Vector2, point2: Vector2): number {
  return Math.sqrt((point2.x - point1.x) ** 2 + (point2.y - point1.y) ** 2);
}
