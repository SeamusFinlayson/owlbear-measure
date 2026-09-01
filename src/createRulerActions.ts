import OBR from "@owlbear-rodeo/sdk";
import { getPluginId, RULER_MESSAGE_CHANNEL, TOOL_ID } from "./idStrings";
import {
  checkIcon,
  questionMarkIcon,
  trashIcon,
  undoIcon,
  xIcon,
} from "./icons";
import { clearRulerItems } from "./clearRulerItems";

export function createRulerActions() {
  OBR.tool.createAction({
    id: getPluginId("clear-all"),
    icons: [
      {
        icon: trashIcon,
        label: "Clear All Rulers",
        filter: {
          activeTools: [TOOL_ID],
          roles: ["GM"],
          metadata: [{ key: "measuring", value: false }],
        },
      },
    ],
    onClick: () => clearRulerItems("ALL"),
  });

  OBR.tool.createAction({
    id: getPluginId("clear"),
    icons: [
      {
        icon: trashIcon,
        label: "Clear My Ruler",
        filter: {
          activeTools: [TOOL_ID],
          roles: ["PLAYER"],
          metadata: [{ key: "measuring", value: false }],
        },
      },
    ],
    onClick: () => clearRulerItems("PLAYER"),
  });

  OBR.tool.createAction({
    id: getPluginId("help"),
    icons: [
      {
        icon: questionMarkIcon,
        label: "Instructions",
        filter: {
          activeTools: [TOOL_ID],
          metadata: [{ key: "measuring", value: false }],
        },
      },
    ],
    onClick: () =>
      OBR.popover.open({
        id: getPluginId("help-popover"),
        height: 800,
        width: 600,
        url: "/docs.html",
      }),
  });

  OBR.tool.createAction({
    id: getPluginId("cancel"),
    icons: [
      {
        icon: xIcon,
        label: "Cancel (Escape)",
        filter: {
          activeTools: [TOOL_ID],
          metadata: [
            { key: "measuring", value: true },
            { key: "points", value: "ONE" },
          ],
        },
      },
    ],
    onClick: () =>
      OBR.broadcast.sendMessage(RULER_MESSAGE_CHANNEL, "CANCEL", {
        destination: "LOCAL",
      }),
  });

  OBR.tool.createAction({
    id: getPluginId("undo"),
    icons: [
      {
        icon: undoIcon,
        label: "Remove Segment (Backspace)",
        filter: {
          activeTools: [TOOL_ID],
          metadata: [
            { key: "measuring", value: true },
            { key: "points", value: "MULTIPLE" },
          ],
        },
      },
    ],
    onClick: () =>
      OBR.broadcast.sendMessage(RULER_MESSAGE_CHANNEL, "UNDO", {
        destination: "LOCAL",
      }),
  });

  OBR.tool.createAction({
    id: getPluginId("check"),
    icons: [
      {
        icon: checkIcon,
        label: "Confirm",
        filter: {
          activeTools: [TOOL_ID],
          metadata: [
            { key: "measuring", value: true },
            { key: "points", value: "MULTIPLE" },
          ],
        },
      },
    ],
    shortcut: "Enter",
    onClick: () =>
      OBR.broadcast.sendMessage(RULER_MESSAGE_CHANNEL, "CONFIRM", {
        destination: "LOCAL",
      }),
  });
}
