/**
 * WebMCP typings from the spec's IDL index as read on 26 Aug 2026 (landscape §1.2), plus the
 * shape of a tool as this app defines it. The `webmcp-types` package lacks `executeTool` and
 * `navigator.modelContext`, so the sixty lines live here.
 */
import type { z } from 'zod';
import type { CommandBus } from './bus.ts';
import type { Envelope } from './envelope.ts';
import type { EnvironmentStore } from './environment.ts';
import type { SongDocument } from '../song/types.ts';

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolExecuteCallbackOptions {
  signal: AbortSignal;
}

/** Chrome 151 calls `execute(inputObject)` with no options; the spec passes `{signal}`. */
export type ToolExecuteCallback = (
  inputObject: Record<string, unknown>,
  options?: ToolExecuteCallbackOptions,
) => Promise<unknown> | unknown;

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  execute: ToolExecuteCallback;
  annotations?: ToolAnnotations;
}

export interface ModelContextRegisterToolOptions {
  exposedTo?: string[];
  signal?: AbortSignal;
}

export interface ModelContextGetToolOptions {
  fromOrigins?: string[];
}

export interface ModelContextExecuteToolOptions {
  signal?: AbortSignal;
}

export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  window: Window;
  origin: string;
  annotations?: ToolAnnotations;
}

export interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>;
  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;
  executeTool?(
    tool: RegisteredTool,
    inputObject?: object,
    options?: ModelContextExecuteToolOptions,
  ): Promise<string>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
  interface Navigator {
    readonly modelContext?: ModelContext;
  }
}

export type ToolKind = 'read' | 'write';

/** A view of the registry a tool may read without owning the registry (used by get_diagnostics). */
export interface RegistryView {
  statusText(): string;
  toolCount(): number;
  callCount(): number;
}

export interface ToolContext {
  bus: CommandBus<SongDocument>;
  environment: EnvironmentStore;
  registry: RegistryView;
  signal: AbortSignal;
}

/**
 * A tool as this app defines it: a zod input schema, the registered description, the kind
 * (which sets `readOnlyHint`), one valid and one invalid example for the contract test, and
 * the `execute` that returns an envelope.
 */
export interface ToolDefinition<TInput extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  kind: ToolKind;
  description: string;
  input: TInput;
  untrustedContent?: boolean;
  example: z.input<TInput>;
  badExample: unknown;
  execute(args: z.output<TInput>, context: ToolContext): Promise<Envelope> | Envelope;
}
