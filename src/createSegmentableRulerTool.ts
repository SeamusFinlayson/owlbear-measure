import OBR from "@owlbear-rodeo/sdk";
import { toolIcon } from "./icons";
import { TOOL_ID } from "./idStrings";

export function createSegmentableRulerTool() {
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
