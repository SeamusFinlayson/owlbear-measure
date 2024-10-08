import {
  Vector2,
  Item,
  buildCurve,
  buildLabel,
  buildShape,
  AttachmentBehavior,
} from "@owlbear-rodeo/sdk";
import { getLabelPosition, calculateDisplayDistance } from "./mathHelpers";
import { Grid, Player, RulerIds } from "./types";
import parse from "color-parse";

const disabledAttachmentBehavior: AttachmentBehavior[] = ["POSITION"];

export async function buildRuler(
  rulerIds: RulerIds,
  grid: Grid,
  player: Player,
  startPosition: Vector2,
  pointerPosition: Vector2,
  visible: boolean,
  endDot: boolean
): Promise<Item[]> {
  const points = [startPosition, pointerPosition];

  const rulerConstituentItems: any[] = [];

  rulerConstituentItems.push(
    buildCurve()
      .id(rulerIds.line)
      // .attachedTo(rulerIds.label)
      .points(points)
      .strokeColor(player.color)
      .fillOpacity(0)
      .strokeWidth(grid.dpi / 15)
      .strokeDash([grid.dpi / 3, grid.dpi / 5])
      .tension(0)
      .visible(visible)
      .layer("RULER")
      .zIndex(10002)
      // .disableAttachmentBehavior(disabledAttachmentBehavior)
      .build()
  );

  rulerConstituentItems.push(
    buildLabel()
      .id(rulerIds.label)
      .attachedTo(rulerIds.line)
      .position(getLabelPosition(grid, pointerPosition))
      .plainText(await calculateDisplayDistance(grid, points))
      // .fontFamily("Times New Roman")
      .pointerHeight(0)
      .backgroundOpacity(0.7)
      .visible(visible)
      .layer("RULER")
      .zIndex(10004)
      // .disableAttachmentBehavior(disabledAttachmentBehavior)
      .disableHit(true)
      .build()
  );

  if (endDot) {
    rulerConstituentItems.push(
      buildShape()
        .id(rulerIds.endDot)
        .attachedTo(rulerIds.line)
        .layer("RULER")
        .position(pointerPosition)
        .shapeType("CIRCLE")
        .fillColor(player.color)
        .strokeColor("white")
        .strokeOpacity(0.03)
        .strokeWidth(grid.dpi / 120)
        .width(grid.dpi / 4)
        .height(grid.dpi / 4)
        .zIndex(10001)
        // .disableAttachmentBehavior(disabledAttachmentBehavior)
        .disableHit(true)
        .build()
    );
  }

  if (useBackground(player.color)) {
    rulerConstituentItems.push(
      buildCurve()
        .id(rulerIds.background)
        .attachedTo(rulerIds.line)
        .points(points)
        .strokeColor("white")
        .strokeOpacity(0.2)
        .fillOpacity(0)
        .strokeWidth(grid.dpi / 8)
        .tension(0)
        .visible(visible)
        .layer("RULER")
        .zIndex(10000)
        // .disableAttachmentBehavior(disabledAttachmentBehavior)
        .disableHit(true)
        .build()
    );
  }

  return rulerConstituentItems;
}

const useBackground = (color: string): boolean => {
  const parsedColor = parse(color);
  if (parsedColor.space !== "rgb") return false;
  const colorMax = Math.max(...parsedColor.values);
  if (colorMax > 100) return false;
  return true;
};
