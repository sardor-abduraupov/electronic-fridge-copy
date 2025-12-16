export async function handleToolCall(tool, args, context) {
  switch (tool) {
    case "updateInventory":
      context.send({
        type: "tool",
        name: tool,
        result: "Inventory updated"
      });
      break;

    case "addToShoppingList":
      context.send({
        type: "tool",
        name: tool,
        result: "Item added to shopping list"
      });
      break;

    default:
      context.send({
        type: "error",
        message: "Unknown tool"
      });
  }
}