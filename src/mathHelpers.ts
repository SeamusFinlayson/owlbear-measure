import OBR, { Vector2 } from "@owlbear-rodeo/sdk";
import { Grid } from "./types";

export async function calculateDisplayDistance(
  grid: Grid,
  points: Vector2[]
): Promise<string> {
  let distance = 0;
  let scaledDistance = 0;
  if (grid.type === "SQUARE") {
    if (grid.measurement === "CHEBYSHEV") {
      for (let i = 1; i < points.length; i++) {
        distance += Math.max(
          Math.abs(Math.round((points[i].x - points[i - 1].x) / grid.dpi)),
          Math.abs(Math.round((points[i].y - points[i - 1].y) / grid.dpi))
        );
      }
      scaledDistance = distance * grid.scale.parsed.multiplier;
    } else if (grid.measurement === "ALTERNATING") {
      for (let i = 1; i < points.length; i++) {
        const vertical = Math.abs(
          Math.round((points[i].y - points[i - 1].y) / grid.dpi)
        );
        const horizontal = Math.abs(
          Math.round((points[i].x - points[i - 1].x) / grid.dpi)
        );
        const longEdge = Math.max(vertical, horizontal);
        const shortEdge = Math.min(vertical, horizontal);
        const diagonalCost = Math.floor(shortEdge * 0.5);
        distance += longEdge + diagonalCost;
      }
      scaledDistance = distance * grid.scale.parsed.multiplier;
    } else if (grid.measurement === "EUCLIDEAN") {
      for (let i = 1; i < points.length; i++) {
        const vertical =
          Math.abs(Math.round((points[i].y - points[i - 1].y) / grid.dpi)) *
          grid.scale.parsed.multiplier;
        const horizontal =
          Math.abs(Math.round((points[i].x - points[i - 1].x) / grid.dpi)) *
          grid.scale.parsed.multiplier;
        scaledDistance += Math.sqrt(vertical ** 2 + horizontal ** 2);
      }
      distance = Math.floor(scaledDistance / grid.scale.parsed.multiplier);
      scaledDistance = Math.floor(scaledDistance);
    } else {
      // grid.measurement is MANHATTAN
      for (let i = 1; i < points.length; i++) {
        const vertical = Math.abs(
          Math.round((points[i].y - points[i - 1].y) / grid.dpi)
        );
        const horizontal = Math.abs(
          Math.round((points[i].x - points[i - 1].x) / grid.dpi)
        );
        distance += vertical + horizontal;
      }
      scaledDistance = distance * grid.scale.parsed.multiplier;
    }
  } else {
    const getDistances: Promise<number>[] = [];
    for (let i = 1; i < points.length; i++) {
      getDistances.push(
        new Promise(resolve => {
          resolve(OBR.scene.grid.getDistance(points[i], points[i - 1]));
        })
      );
    }
    const distances = await Promise.all(getDistances);
    let totalDistance = 0;
    distances.forEach(distance => {
      totalDistance += distance;
    });

    if (grid.measurement === "EUCLIDEAN") {
      distance = Math.trunc(totalDistance);
      scaledDistance = Math.trunc(totalDistance * grid.scale.parsed.multiplier);
    } else {
      distance = Math.round(totalDistance);
      scaledDistance = Math.round(totalDistance * grid.scale.parsed.multiplier);
    }
  }

  // return `${distance}sq`;
  return `${scaledDistance}${grid.scale.parsed.unit}`;
  // return `Scaled distance: ${scaledDistance}${grid.scale.parsed.unit}
  // Distance: ${distance}sq`;
  // return `${scaledDistance}${grid.scale.parsed.unit}\n${distance}sq`;
}

export async function calculateSegmentEndPosition(
  grid: Grid,
  startPosition: Vector2,
  pointerPosition: Vector2
): Promise<Vector2> {
  if (grid.type === "SQUARE") {
    return {
      x:
        startPosition.x +
        Math.round((pointerPosition.x - startPosition.x) / grid.dpi) * grid.dpi,
      y:
        startPosition.y +
        Math.round((pointerPosition.y - startPosition.y) / grid.dpi) * grid.dpi,
    };
  } else {
    if (grid.measurement === "EUCLIDEAN")
      return await OBR.scene.grid.snapPosition(pointerPosition, 0);
    return await OBR.scene.grid.snapPosition(pointerPosition, 1);
  }
}

export async function calculateInitialPosition(
  grid: Grid,
  position: Vector2
): Promise<Vector2> {
  if (grid.type === "SQUARE") {
    const nearestVertex = {
      x: Math.round(position.x / grid.dpi) * grid.dpi,
      y: Math.round(position.y / grid.dpi) * grid.dpi,
    };
    // Centers are offset from vertices by half a cell
    const halfGridDpi = grid.dpi * 0.5;
    const nearestCenter = {
      x:
        Math.round((position.x + halfGridDpi) / grid.dpi) * grid.dpi -
        halfGridDpi,
      y:
        Math.round((position.y + halfGridDpi) / grid.dpi) * grid.dpi -
        halfGridDpi,
    };
    if (distance(position, nearestVertex) < distance(position, nearestCenter)) {
      return nearestVertex;
    }
    return nearestCenter;
  } else {
    if (grid.measurement === "EUCLIDEAN")
      return await OBR.scene.grid.snapPosition(position, 0);
    return await OBR.scene.grid.snapPosition(position, 1);
  }
}

function distance(point1: Vector2, point2: Vector2): number {
  return Math.sqrt((point2.x - point1.x) ** 2 + (point2.y - point1.y) ** 2);
}

export function getLabelPosition(
  grid: Grid,
  rulerEndPosition: Vector2
): Vector2 {
  return {
    x: rulerEndPosition.x,
    y: rulerEndPosition.y - grid.dpi / 2,
  };
}
