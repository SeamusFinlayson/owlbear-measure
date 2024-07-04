import { GridMeasurement, GridScale, Image, Vector2 } from "@owlbear-rodeo/sdk";

export interface Grid {
  dpi: number;
  scale: GridScale;
  measurement: GridMeasurement;
  update: (dpi: number, scale: GridScale, measurement: GridMeasurement) => void;
}

export function createGrid(
  dpi: number,
  scale: GridScale,
  measurement: GridMeasurement
): Grid {
  const grid: Grid = {
    dpi: dpi,
    scale: scale,
    measurement: measurement,
    update: (dpi: number, scale: GridScale, measurement: GridMeasurement) => {
      dpi = dpi;
      scale = scale;
      measurement = measurement;
    },
  };

  return grid;
}

export function calculateDisplayDistance(
  grid: Grid,
  points: Vector2[]
): string {
  if (grid.measurement === "CHEBYSHEV") {
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += Math.max(
        Math.abs(Math.round((points[i].x - points[i - 1].x) / grid.dpi)),
        Math.abs(Math.round((points[i].y - points[i - 1].y) / grid.dpi))
      );
    }
    return `${distance * grid.scale.parsed.multiplier}${
      grid.scale.parsed.unit
    }`;
  }

  if (grid.measurement === "ALTERNATING") {
    let distance = 0;
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
    return `${distance * grid.scale.parsed.multiplier}${
      grid.scale.parsed.unit
    }`;
  }

  if (grid.measurement === "EUCLIDEAN") {
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const vertical =
        Math.abs(Math.round((points[i].y - points[i - 1].y) / grid.dpi)) *
        grid.scale.parsed.multiplier;
      const horizontal =
        Math.abs(Math.round((points[i].x - points[i - 1].x) / grid.dpi)) *
        grid.scale.parsed.multiplier;
      distance += Math.sqrt(vertical ** 2 + horizontal ** 2);
    }
    return `${Math.round(distance)}${grid.scale.parsed.unit}`;
  }

  // grid.measurement is MANHATTAN
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const vertical = Math.abs(
      Math.round((points[i].y - points[i - 1].y) / grid.dpi)
    );
    const horizontal = Math.abs(
      Math.round((points[i].x - points[i - 1].x) / grid.dpi)
    );
    distance += vertical + horizontal;
  }
  return `${distance * grid.scale.parsed.multiplier}${grid.scale.parsed.unit}`;
}

export function calculateSegmentEndPosition(
  grid: Grid,
  startPosition: Vector2,
  pointerPosition: Vector2
): Vector2 {
  return {
    x:
      startPosition.x +
      Math.round((pointerPosition.x - startPosition.x) / grid.dpi) * grid.dpi,
    y:
      startPosition.y +
      Math.round((pointerPosition.y - startPosition.y) / grid.dpi) * grid.dpi,
  };
}

export function calculateInitialPosition(grid: Grid, token: Image): Vector2 {
  const nearestVertex = {
    x: Math.round(token.position.x / grid.dpi) * grid.dpi,
    y: Math.round(token.position.y / grid.dpi) * grid.dpi,
  };
  // Centers are offset from vertices by half a cell
  const halfGridDpi = grid.dpi * 0.5;
  const nearestCenter = {
    x:
      Math.round((token.position.x + halfGridDpi) / grid.dpi) * grid.dpi -
      halfGridDpi,
    y:
      Math.round((token.position.y + halfGridDpi) / grid.dpi) * grid.dpi -
      halfGridDpi,
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
