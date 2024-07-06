export const SHORT_ID_PREFIX = "segmented-ruler";
export const TOOL_ID = getPluginId("tool");
export const DRAG_MEASURE_MODE_ID = getPluginId("dragMode");
export const PRIVATE_DRAG_MEASURE_MODE_ID = getPluginId("privateDragMode");
export const CLEAR_RULERS_ACTION_ID = getPluginId("deleteAction");

function getPluginId(path: string) {
  return `com.measure-extension/${path}`;
}

export function getItemId(
  name: string,
  playerId: string,
  local = false
): string {
  return `${SHORT_ID_PREFIX}-${name}-${playerId}` + (local ? "-local" : "");
}
