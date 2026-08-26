/**
 * Zod input schemas for every tool, exported to JSON Schema with `additionalProperties: false`
 * (plan Decision 16), and the budgets the contract test enforces (plan Decision 18; Chrome's
 * limits, landscape §1.8).
 */
import { z } from 'zod';
import { formatZodError, ToolError } from './envelope.ts';

export const BUDGETS = {
  name: 30,
  description: 500,
  parameterDescription: 150,
  output: 1500,
} as const;

export const NAME_PATTERN = /^[a-z][a-z0-9_]{0,29}$/;

export const whyField = z
  .string()
  .min(1)
  .max(200)
  .describe(
    'One sentence for the person on why you made this change; it is pinned to the change as a producer note',
  );

export const expectedRevisionField = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .describe('The revision you last read; refused with STALE_REVISION if the song has moved on');

export const pingInput = z.strictObject({
  message: z.string().min(1).max(200).describe('Short text to echo back in the summary'),
});

export const getDiagnosticsInput = z.strictObject({});

export interface JsonSchemaObject extends JsonSchemaNode {
  type: 'object';
  properties: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties: false;
}

export interface JsonSchemaNode {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode | JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  [key: string]: unknown;
}

/**
 * Converts a zod object schema to the JSON Schema registered with the browser.
 *
 * @param schema - A `z.strictObject`.
 * @returns The schema without the `$schema` key and with `additionalProperties: false` at the root.
 */
export function toInputSchema(schema: z.ZodObject): JsonSchemaObject {
  const json = z.toJSONSchema(schema) as JsonSchemaObject & { $schema?: string };
  delete json.$schema;
  if (json.type !== 'object' || json.additionalProperties !== false) {
    throw new Error('Tool input schemas must be strict objects.');
  }
  return json;
}

/**
 * Validates an input against a tool's schema.
 *
 * @param schema - The tool's zod schema.
 * @param input - The raw input from the browser.
 * @returns The parsed input.
 * @throws ToolError with `INVALID_ARGUMENT` listing every issue.
 */
export function parseInput<S extends z.ZodObject>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ToolError('INVALID_ARGUMENT', formatZodError(result.error), true);
  }
  return result.data;
}

/**
 * Lists every parameter description in a schema, for the budget test.
 *
 * @param schema - The JSON Schema.
 * @returns Paths and descriptions, depth first.
 */
export function collectParameterDescriptions(
  schema: JsonSchemaNode,
): { path: string; description: string }[] {
  const found: { path: string; description: string }[] = [];
  const walk = (node: JsonSchemaNode, path: string): void => {
    if (typeof node.description === 'string' && path !== '') {
      found.push({ path, description: node.description });
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      walk(child, path === '' ? key : `${path}.${key}`);
    }
    const items = node.items;
    if (Array.isArray(items)) {
      items.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (items) {
      walk(items, `${path}[]`);
    }
    for (const variant of [...(node.anyOf ?? []), ...(node.oneOf ?? [])]) {
      walk(variant, path);
    }
  };
  walk(schema, '');
  return found;
}
