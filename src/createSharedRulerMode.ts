import OBR, {
  InteractionManager,
  Item,
  Vector2,
  isImage,
  isCurve,
  isShape,
  isLabel,
  ToolEvent,
} from "@owlbear-rodeo/sdk";
import { sharedRulerIcon } from "./icons";
import {
  snapPosition,
  calculateSegmentEndPosition,
  calculateDisplayDistance,
  getLabelPosition,
} from "./mathHelpers";
import {
  DRAG_MEASURE_MODE_ID,
  getItemId,
  getPluginId,
  RULER_MESSAGE_CHANNEL,
  TOOL_ID,
} from "./idStrings";
import { Grid, Player, RulerIds } from "./types";
import { buildRuler } from "./rulerBuilder";
import { updateToolMetadata } from "./updateToolMetadata";

type TimeStampedInteractionManager = {
  initTime: number;
  manager: InteractionManager<Item[]>;
};

export function createSharedRulerMode(grid: Grid, player: Player) {
  let interactions: TimeStampedInteractionManager[] = [];
  let currentRulerInitTime = 0;

  const endUnusedInteractions = () => {
    const newItemInteractions: TimeStampedInteractionManager[] = [];
    for (let i = 0; i < interactions.length; i++) {
      if (currentRulerInitTime !== interactions[i].initTime) {
        interactions[i].manager[1]();
      } else {
        newItemInteractions.push(interactions[i]);
      }
    }
    interactions = newItemInteractions;
  };

  // State that doesn't require extra handling
  let initialInteractedItem: Item | null = null;
  let sharedAttachments: Item[] = [];
  let localAttachments: Item[] = [];

  let rulerPoints: Vector2[] = []; // Points in the line being measured
  let pointerPosition: Vector2; // Track pointer position so it accessible to keyboard events
  let lastPosition: Vector2; // Memoize last position the token snapped to to prevent path measurement recalculation

  const rulerIds: RulerIds = {
    background: getItemId("background", player.id),
    line: getItemId("line", player.id),
    label: getItemId("label", player.id),
    endDot: getItemId("end-point", player.id),
  };

  const createRulerInteractions = async (event: ToolEvent) => {
    const interactionStartTime = Date.now();
    currentRulerInitTime = interactionStartTime;
    pointerPosition = event.pointerPosition;
    OBR.scene.items.deleteItems(Object.values(rulerIds));
    let interaction: InteractionManager<Item[]>;

    const [updateMount, updateCharacter] = await Promise.all([
      player.role === "GM" || OBR.player.hasPermission("MOUNT_UPDATE"),
      player.role === "GM" || OBR.player.hasPermission("CHARACTER_UPDATE"),
    ]);

    const token = event.target;
    const idsInUse = (await OBR.party.getPlayers())
      .map((player) => player.metadata?.[getPluginId("targetItem")])
      .filter((val) => typeof val === "string");

    if (
      token &&
      isImage(token) &&
      !idsInUse.includes(token.id) &&
      ((token.layer === "CHARACTER" && updateCharacter) ||
        (token.layer === "MOUNT" && updateMount)) &&
      !token.locked &&
      !event.ctrlKey
    ) {
      initialInteractedItem = token;
      const startPosition = await snapPosition(grid, token.position);
      lastPosition = startPosition;
      console.log("start poistion", startPosition);
      rulerPoints = [];
      rulerPoints.push(startPosition);

      [interaction, sharedAttachments, localAttachments] = await Promise.all([
        OBR.interaction.startItemInteraction([
          ...(await buildRuler(
            rulerIds,
            grid,
            player,
            [startPosition, await snapPosition(grid, pointerPosition)],
            token.visible,
            true,
          )),
          token,
        ]),
        OBR.scene.items.getItemAttachments([token.id]),
        OBR.scene.local.getItemAttachments([token.id]),
        OBR.player.setMetadata({ [getPluginId("targetItem")]: token.id }),
      ]);
    } else {
      initialInteractedItem = null;
      const startPosition = await snapPosition(grid, pointerPosition);
      lastPosition = startPosition;
      rulerPoints = [];
      rulerPoints.push(startPosition);

      [interaction] = await Promise.all([
        OBR.interaction.startItemInteraction(
          await buildRuler(
            rulerIds,
            grid,
            player,
            [startPosition, pointerPosition],
            true,
            true,
          ),
        ),
      ]);
    }

    interactions.push({ manager: interaction, initTime: interactionStartTime });

    // Because this function is asynchronous and contains await statements, interactions
    // may already be expired if the drag was short enough in duration
    endUnusedInteractions();

    setTimeout(() => {
      recreateRulerInteractions(interactionStartTime);
    }, 700);
  };

  const recreateRulerInteractions = async (parentRulerInitTime: number) => {
    if (currentRulerInitTime === parentRulerInitTime) {
      const interactionStartTime = Date.now();
      currentRulerInitTime = interactionStartTime;
      let interactionManager: InteractionManager<Item[]> | null = null;
      rulerIds.label = getItemId("label", player.id) + Math.random();

      const endPointPosition = await calculateSegmentEndPosition(
        grid,
        rulerPoints[rulerPoints.length - 1],
        pointerPosition,
      );
      if (initialInteractedItem !== null) {
        const endPointItem = { ...initialInteractedItem };
        endPointItem.position = endPointPosition;
        [interactionManager, sharedAttachments, localAttachments] =
          await Promise.all([
            OBR.interaction.startItemInteraction([
              ...(await buildRuler(
                rulerIds,
                grid,
                player,
                [...rulerPoints, endPointPosition],
                endPointItem.visible,
                true,
              )),
              endPointItem,
            ]),
            OBR.scene.items.getItemAttachments([endPointItem.id]),
            OBR.scene.local.getItemAttachments([endPointItem.id]),
          ]);
      } else {
        [interactionManager] = await Promise.all([
          OBR.interaction.startItemInteraction(
            await buildRuler(
              rulerIds,
              grid,
              player,
              [...rulerPoints, endPointPosition],
              true,
              true,
            ),
          ),
        ]);
      }

      // TODO: interaction cleanup here
      endUnusedInteractions();

      interactions.push({
        initTime: interactionStartTime,
        manager: interactionManager,
      });

      // Call again after delay
      setTimeout(() => {
        recreateRulerInteractions(interactionStartTime);
      }, 700);
    } else {
      console.log("ended");
    }
    endUnusedInteractions();
  };

  const addSegment = async (position?: Vector2) => {
    position ?? pointerPosition;
    rulerPoints.push(
      await calculateSegmentEndPosition(
        grid,
        rulerPoints[rulerPoints.length - 1],
        pointerPosition,
      ),
    );
    if (rulerPoints.length >= 2) updateToolMetadata({ points: "MULTIPLE" });
  };

  const removeSegment = async () => {
    if (rulerPoints.length <= 1) return;

    // Remove most recent segment
    rulerPoints.pop();
    // Refresh with segment removed
    pointerPosition = rulerPoints[rulerPoints.length - 1];
    await updateToolItems();
    updateToolItems(true);

    if (rulerPoints.length === 1) updateToolMetadata({ points: "ONE" });
  };

  const addRulerToScene = (items: Item[]) => {
    const ruler: Item[] = [];
    let addItemsToScene = true;
    for (let rulerId of Object.values(rulerIds)) {
      for (let item of items) {
        if (
          item.id === rulerIds.label &&
          isLabel(item) &&
          item.text.plainText.startsWith("0")
        ) {
          addItemsToScene = false;
        }
        if (item.id === rulerId) {
          ruler.push(item);
          break;
        }
      }
    }
    if (addItemsToScene) OBR.scene.items.addItems(ruler);
  };

  const cleanupRuler = () => {
    currentRulerInitTime = 0;
    endUnusedInteractions();
    updateToolMetadata({ measuring: false, points: "NONE" });
    OBR.player.setMetadata({ [getPluginId("targetItem")]: undefined });
  };

  OBR.broadcast.onMessage(RULER_MESSAGE_CHANNEL, async (event) => {
    if (interactions.length === 0) return;

    if (event.data === "CONFIRM") {
      const items = await buildRuler(
        rulerIds,
        grid,
        player,
        rulerPoints,
        true,
        true,
      );
      await updateInteractionTargetItems(rulerPoints[rulerPoints.length - 1]);
      addRulerToScene(items);
      cleanupRuler();
    } else if (event.data === "UNDO") {
      removeSegment();
    } else if (event.data === "CANCEL") {
      await updateInteractionTargetItems(rulerPoints[0]);
      cleanupRuler();
    }
  });

  OBR.tool.createMode({
    id: DRAG_MEASURE_MODE_ID,
    icons: [
      {
        icon: sharedRulerIcon,
        label: "Public Ruler",
        filter: {
          activeTools: [TOOL_ID],
        },
      },
    ],
    cursors: [
      {
        cursor: "crosshair",
        filter: {
          metadata: [{ key: "measuring", value: true, operator: "==" }],
        },
      },
      {
        cursor: "pointer",
        filter: {
          target: [
            { key: "locked", value: true, operator: "!=" },
            { key: "image", value: undefined, operator: "!=" },
            { key: "layer", value: "CHARACTER" },
          ],
          metadata: [{ key: "ctrlPressed", value: true, operator: "!=" }],
          permissions: ["CHARACTER_UPDATE"],
        },
      },
      {
        cursor: "pointer",
        filter: {
          target: [
            { key: "locked", value: true, operator: "!=" },
            { key: "image", value: undefined, operator: "!=" },
            { key: "layer", value: "MOUNT" },
          ],
          metadata: [{ key: "ctrlPressed", value: true, operator: "!=" }],
          permissions: ["MOUNT_UPDATE"],
        },
      },
      { cursor: "move" },
    ],
    preventDrag: {
      target: [{ key: "locked", value: true }],
      metadata: [{ key: "measuring", value: false }],
    },
    onToolClick: async (_, event) => {
      if (interactions.length === 0) {
        createRulerInteractions(event);
        updateToolMetadata({ measuring: true, points: "ONE" });
      } else {
        addSegment(event.target?.position);
      }
    },
    onToolMove: (_, event) => {
      updateToolMetadata({ ctrlPressed: event.ctrlKey });
      if (interactions.length === 0) return;
      pointerPosition = event.pointerPosition;
      updateToolItems();
    },
    onKeyDown: async (_, event) => {
      if (interactions.length === 0) return;

      if (event.key === "Delete") removeSegment();
      if (event.key === "Backspace") removeSegment();

      if (event.key === "Escape") {
        await updateInteractionTargetItems(rulerPoints[0]);
        cleanupRuler();
      }
    },
    onToolDragEnd(_, event) {
      if (interactions.length === 0) return;
      addSegment(event.target?.position);
    },
    onToolDoubleClick: async (_, event) => {
      if (interactions.length === 0) return;
      // Run final update
      const items = await updateToolItems();
      await updateInteractionTargetItems(event.pointerPosition);

      // Add ruler to the scene
      addRulerToScene(items);

      cleanupRuler();
    },
    onDeactivate: async () => {
      if (interactions.length === 0) return;
      await updateInteractionTargetItems(rulerPoints[0]);
      cleanupRuler();
    },
  });

  async function updateInteractionTargetItems(pointerPosition: Vector2) {
    if (interactions && initialInteractedItem) {
      const startPosition = rulerPoints[0];

      const newPosition = await calculateSegmentEndPosition(
        grid,
        rulerPoints[rulerPoints.length - 1],
        pointerPosition,
      );

      const positionChange = {
        x: newPosition.x - startPosition.x,
        y: newPosition.y - startPosition.y,
      };

      // Update dragged item and shared attachments
      for (let i = 0; i < sharedAttachments.length; i++) {
        sharedAttachments[i].position.x += positionChange.x;
        sharedAttachments[i].position.y += positionChange.y;
      }
      OBR.scene.items.addItems(sharedAttachments);

      // Update local attachments
      for (let i = 0; i < localAttachments.length; i++) {
        localAttachments[i].position.x += positionChange.x;
        localAttachments[i].position.y += positionChange.y;
      }
      OBR.scene.local.addItems(localAttachments);
    }
  }

  async function updateToolItems(forceRecalculation = false): Promise<Item[]> {
    const newPosition = await calculateSegmentEndPosition(
      grid,
      rulerPoints[rulerPoints.length - 1],
      pointerPosition,
    );

    let newText: string | null = null;
    if (
      !(lastPosition.x === newPosition.x && newPosition.y === lastPosition.y) ||
      forceRecalculation
    ) {
      newText = await calculateDisplayDistance(grid, [
        ...rulerPoints,
        newPosition,
      ]);
    }
    lastPosition = newPosition;

    let items: Item[] = [];
    const manager = interactions.find(
      (value) => value.initTime === currentRulerInitTime,
    )?.manager;
    if (manager) {
      items = manager[0]((items) => {
        items.forEach((item) => {
          if (initialInteractedItem && item.id === initialInteractedItem.id) {
            item.position = newPosition;
          } else if (item.id === rulerIds.line && isCurve(item)) {
            item.points = [...rulerPoints, newPosition];
          } else if (item.id === rulerIds.background && isCurve(item)) {
            item.points = [...rulerPoints, newPosition];
          } else if (item.id === rulerIds.endDot && isShape(item)) {
            item.position = newPosition;
          } else if (item.id.includes(rulerIds.label) && isLabel(item)) {
            item.position = getLabelPosition(grid, newPosition);
            if (newText) item.text.plainText = newText;
          }
        });
      });
    }

    return items;
  }
}
