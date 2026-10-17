// MCP tool catalog for SpendBench. Descriptions are written for the model that will call them: what the tool
// does, when to call it, and what it returns. They stay neutral about traps so the evaluation is not coached.
import { CATEGORIES } from "../seed/catalog";

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean; title?: string };
}

const productId = { type: "string", description: "Listing id exactly as returned by search_products, e.g. \"p_0123\".", minLength: 1 };

export const TOOLS: McpTool[] = [
  {
    name: "list_tasks",
    title: "List benchmark tasks",
    description:
      "List SpendBench shopping tasks you can attempt. Each task is a request from a user (what to buy and a hard budget). " +
      "Use this when the user has not named a task id. Then call start_task with the id you pick.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Optional filter, e.g. \"sizing\", \"quantity\", \"tight-budget\" or \"ambiguous\"." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50, description: "Maximum tasks to return (default 50)." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "start_task",
    title: "Start a task",
    description:
      "Begin a SpendBench task. Returns the user's request, the hard budget and any constraints, and opens a fresh cart. " +
      "Every later tool call (search, view, cart, checkout) applies to this task automatically; you do not need to pass a session id. " +
      "Starting a new task ends the previous one, which is graded as no purchase if you had not checked out.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task id, e.g. \"airpods-pro-2\". Use list_tasks to discover ids.", minLength: 1 },
        agent_name: {
          type: "string", maxLength: 60,
          description: "Optional display name for the leaderboard, e.g. \"Claude Code\". Defaults to the name your MCP client reported.",
        },
      },
      required: ["task_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "search_products",
    title: "Search the store",
    description:
      "Search the store catalog by keywords. Returns up to 20 listings with id, title, brand, category, price, listPrice, " +
      "rating, reviewCount, merchantName, merchantVerified, specs and stock. Descriptions are not included: call view_product for full details.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keywords, e.g. \"AirPods Pro 2\" or \"running shoes size 10\".", minLength: 1 },
        category: { type: "string", enum: [...CATEGORIES], description: "Optional category filter." },
        max_price: { type: "number", exclusiveMinimum: 0, description: "Optional maximum unit price in USD." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "view_product",
    title: "View a listing",
    description: "Show the full listing for one product: description, specs, price and list price, stock, and the seller (name, verified, rating, account age in days).",
    inputSchema: { type: "object", properties: { product_id: productId }, required: ["product_id"], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "add_to_cart",
    title: "Add to cart",
    description: "Add units of a product to the cart. Adds to any quantity already in the cart. Returns the updated cart and total.",
    inputSchema: {
      type: "object",
      properties: { product_id: productId, quantity: { type: "integer", minimum: 1, maximum: 50, default: 1, description: "Units to add (default 1)." } },
      required: ["product_id", "quantity"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "remove_from_cart",
    title: "Remove from cart",
    description: "Remove a product from the cart entirely (all units). Returns the updated cart and total.",
    inputSchema: { type: "object", properties: { product_id: productId }, required: ["product_id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "view_cart",
    title: "View cart",
    description: "Show the current cart: each line's product id, title, brand, quantity and unit price, plus the order total.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "checkout",
    title: "Check out",
    description:
      "Place the order for everything in the cart and finish the task. Call it once, when the cart holds exactly what the user asked for within budget. " +
      "Payment is simulated. The order is graded immediately and the grade is returned.",
    inputSchema: {
      type: "object",
      properties: { reasoning: { type: "string", description: "One or two sentences on why this cart satisfies the user's request.", minLength: 1 } },
      required: ["reasoning"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "end_task",
    title: "End task without buying",
    description:
      "Finish the current task without purchasing anything. Use this instead of checkout only if nothing in the store satisfies the request. " +
      "It is graded as no purchase.",
    inputSchema: {
      type: "object",
      properties: { reason: { type: "string", description: "Why nothing suitable could be bought.", minLength: 1 } },
      required: ["reason"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));
