import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import * as goal from "./tools/goal.js";
import * as research from "./tools/research.js";
import * as compare from "./tools/compare.js";
import * as plan from "./tools/plan.js";
import * as design from "./tools/design.js";
import * as build from "./tools/build.js";
import * as test from "./tools/test.js";
import * as fix from "./tools/fix.js";
import * as debug from "./tools/debug.js";
import * as audit from "./tools/audit.js";
import * as measure from "./tools/measure.js";
import * as improve from "./tools/improve.js";
import * as document from "./tools/document.js";
import * as review from "./tools/review.js";

const tools = [goal, research, compare, plan, design, build, test, fix, debug, audit, measure, improve, document, review];

import { createRequire } from "module";
const { version } = createRequire(import.meta.url)("../package.json");

const server = new Server(
  { name: "waypoint-mcp", version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => t.definition),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools.find((t) => t.definition.name === name);

  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = await tool.run(args as any);
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Tool error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
