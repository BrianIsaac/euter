/**
 * Every tool the page registers, in registration order. Today: the two probe tools.
 */
import type { ToolDefinition } from '../types.ts';
import { getDiagnostics } from './get_diagnostics.ts';
import { ping } from './ping.ts';

export const tools: readonly ToolDefinition[] = [getDiagnostics, ping] as readonly ToolDefinition[];
