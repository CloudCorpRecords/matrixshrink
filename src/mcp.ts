/**
 * matrixshrink MCP server. Tools: find_redundant_combos.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The analysis is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { findRedundantCombos, formatPayload, VERSION } from "./matrixshrink.js";

const TOOLS = [
  {
    name: "find_redundant_combos",
    description:
      "Find redundant CI matrix combinations: combos whose runs always pass and whose coverage is fully exercised by other combos that stay, from caller-supplied run history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        combos: {
          type: "array",
          description: "Matrix combinations in the CI matrix (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Combination identifier (unique across the set)",
              },
              dimensions: {
                type: "object",
                description:
                  "Dimension values for this combination, e.g. {\"os\": \"linux\", \"node\": \"20\"} (optional, default {})",
                additionalProperties: { type: "string" },
              },
            },
            required: ["id"],
          },
        },
        runs: {
          type: "array",
          description: "Recorded CI runs (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              combo: {
                type: "string",
                description: "Id of the combination this run exercised",
              },
              outcome: {
                type: "string",
                description: "Run outcome: \"pass\" or \"fail\"",
              },
              covered: {
                type: "array",
                description:
                  "Coverage keys this run exercised, e.g. test files or feature ids (optional, default [])",
                items: { type: "string" },
              },
            },
            required: ["combo", "outcome"],
          },
        },
      },
      required: ["combos", "runs"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "matrixshrink", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "find_redundant_combos") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = findRedundantCombos(raw.combos, raw.runs);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
