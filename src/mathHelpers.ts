import OBR, {
  GridMeasurement,
  GridScale,
  GridType,
  Image,
  Vector2,
} from "@owlbear-rodeo/sdk";

export interface Grid {
  dpi: number;
  type: GridType;
  measurement: GridMeasurement;
  scale: GridScale;
  update: (
    dpi: number,
    type: GridType,
    measurement: GridMeasurement,
    scale: GridScale
  ) => void;
}

export function createGrid(
  dpi: number,
  type: GridType,
  measurement: GridMeasurement,
  scale: GridScale
): Grid {
  const grid: Grid = {
    dpi: dpi,
    type: type,
    measurement: measurement,
    scale: scale,
    update: (
      dpi: number,
      type: GridType,
      measurement: GridMeasurement,
      scale: GridScale
    ) => {
      grid.dpi = dpi;
      grid.type = type;
      grid.measurement = measurement;
      grid.scale = scale;
    },
  };

  return grid;
}

export async function calculateDisplayDistance(
  grid: Grid,
  points: Vector2[]
): Promise<string> {
  if (grid.type === "SQUARE") {
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
    } else if (grid.measurement === "ALTERNATING") {
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
    } else if (grid.measurement === "EUCLIDEAN") {
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
    } else {
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
      return `${distance * grid.scale.parsed.multiplier}${
        grid.scale.parsed.unit
      }`;
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

    return `${Math.round(totalDistance * grid.scale.parsed.multiplier)}${
      grid.scale.parsed.unit
    }`;
  }
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
  token: Image
): Promise<Vector2> {
  if (grid.type === "SQUARE") {
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
  } else {
    if (grid.measurement === "EUCLIDEAN")
      return await OBR.scene.grid.snapPosition(token.position, 0);
    return await OBR.scene.grid.snapPosition(token.position, 1);
  }
}

function distance(point1: Vector2, point2: Vector2): number {
  return Math.sqrt((point2.x - point1.x) ** 2 + (point2.y - point1.y) ** 2);
}
