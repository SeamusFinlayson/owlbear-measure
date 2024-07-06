import OBR from "@owlbear-rodeo/sdk";
import { CLEAR_RULERS_ACTION_ID, SHORT_ID_PREFIX, TOOL_ID } from "./idStrings";
import { deleteActionIcon } from "./icons";
import { Player } from "./types";

export function createClearRulersAction(player: Player) {
  if (player.role === "GM") {
    OBR.tool.createAction({
      id: CLEAR_RULERS_ACTION_ID,
      icons: [
        {
          icon: deleteActionIcon,
          label: "Clear Rulers",
          filter: {
            activeTools: [TOOL_ID],
          },
        },
      ],
      onClick: async () => {
        const items = await OBR.scene.items.getItems(
          item => item.layer === "RULER"
        );
        const deleteList: string[] = [];
        for (let item of items) {
          if (item.id.startsWith(SHORT_ID_PREFIX, 0)) deleteList.push(item.id);
        }
        OBR.scene.items.deleteItems(deleteList);
      },
    });
  } else {
    OBR.tool.removeAction(CLEAR_RULERS_ACTION_ID);
  }
}
