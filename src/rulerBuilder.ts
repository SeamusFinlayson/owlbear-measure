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
  visible: boolean,
  endDot: boolean
): Promise<Item[]> {
  const rulerBackground = buildCurve()
    .id(rulerIds.background)
    .attachedTo(rulerIds.label)
    .points([startPosition])
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
    .points([startPosition])
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
    .position(getLabelPosition(grid, startPosition))
    .plainText(
      await calculateDisplayDistance(grid, [startPosition, startPosition])
    )
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
    .build();

  return [rulerBackground, rulerLine, rulerLabel, rulerEndDot];
}
