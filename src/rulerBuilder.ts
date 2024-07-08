import {
  Vector2,
  Item,
  buildCurve,
  buildLabel,
  buildShape,
} from "@owlbear-rodeo/sdk";
import { getLabelPosition, calculateDisplayDistance } from "./mathHelpers";
import { Grid, Player, RulerIds } from "./types";

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

  const rulerBackground = buildCurve()
    .id(rulerIds.background)
    .attachedTo(rulerIds.label)
    .points(points)
    .strokeColor("white")
    .strokeOpacity(0.2)
    .fillOpacity(0)
    .strokeWidth(grid.dpi / 8)
    .tension(0)
    .visible(visible)
    .layer("RULER")
    .zIndex(10000)
    .build();

  const rulerLine = buildCurve()
    .id(rulerIds.line)
    .attachedTo(rulerIds.background)
    .points(points)
    .strokeColor(player.color)
    .fillOpacity(0)
    .strokeWidth(grid.dpi / 15)
    .strokeDash([grid.dpi / 3, grid.dpi / 5])
    .tension(0)
    .visible(visible)
    .layer("RULER")
    .zIndex(10002)
    .build();

  const rulerLabel = buildLabel()
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
    .build();

  if (!endDot) {
    return [rulerBackground, rulerLine, rulerLabel];
  }

  const rulerEndDot = buildShape()
    .id(rulerIds.endDot)
    .attachedTo(rulerIds.label)
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
    .disableHit(true)
    .build();

  return [rulerBackground, rulerLine, rulerLabel, rulerEndDot];
}
