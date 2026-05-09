/**
 * ToolCallRenderer — renders agent tool calls with expandable details.
 * Parses tool_use/tool_result patterns from Anthropic-style messages.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCall {
  name: string;
  input: string;
  output?: string;
  status: 'running' | 'success' | 'error';
}

interface ToolCallRendererProps {
  content: string;
  className?: string;
}

/** Parse tool_use/tool_result blocks from message content.
 * Handles patterns like:
 * - <tool_use>{"name": "...", "input": {...}}</tool_use>
 * - {"type": "tool_use", "name": "...", "input": {...}}
 * - Plain tool call markers
 */
function parseToolCalls(content: string): { text: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  let remaining = content;

  // Pattern 1: JSON tool_use blocks
  const toolUsePattern = /(?:<tool_use>|{"type"\s*:\s*"tool_use"\s*,?\s*)("name"\s*:\s*"[^"]+"\s*,?\s*"input"\s*:\s*{[^}]*})/g;
  let match;

  // Pattern 2: Simple tool call JSON
  const simpleToolPattern = /\{[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*"input"\s*:\s*(\{[^{}]*\})[^{}]*\}/g;

  // Try to extract tool calls from the content
  while ((match = simpleToolPattern.exec(remaining)) !== null) {
    const name = match[1];
    const input = match[2];
    toolCalls.push({
      name,
      input,
      status: 'success',
    });
  }

  // Remove tool call JSON from the text to avoid double-rendering
  let text = content;
  for (const tc of toolCalls) {
    // Try to remove the JSON representation
    const jsonStr = JSON.stringify({ name: tc.name, input: tc.input });
    text = text.replace(jsonStr, '');
    // Also try with pretty formatting
    try {
      const prettyJson = JSON.stringify({ name: tc.name, input: JSON.parse(tc.input) }, null, 2);
      text = text.replace(prettyJson, '');
    } catch { /* ignore */ }
  }

  // Clean up remaining text
  text = text.replace(/<tool_use>|<\/tool_use>|<tool_result>|<\/tool_result>/g, '').trim();

  return { text, toolCalls };
}

export function ToolCallRenderer({ content, className }: ToolCallRendererProps) {
  const { text, toolCalls } = parseToolCalls(content);

  if (toolCalls.length === 0) {
    return <span className={className}>{content}</span>;
  }

  return (
    <div className="space-y-2">
      {text && <span className={className}>{text}</span>}
      {toolCalls.map((tc, i) => (
        <ToolCallItem key={i} tool={tc} />
      ))}
    </div>
  );
}

function ToolCallItem({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = tool.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />
    : tool.status === 'success' ? <CheckCircle2 className="w-3 h-3 text-green-400" />
    : <XCircle className="w-3 h-3 text-red-400" />;

  let parsedInput: string;
  try {
    const obj = typeof tool.input === 'string' ? JSON.parse(tool.input) : tool.input;
    parsedInput = JSON.stringify(obj, null, 2);
  } catch {
    parsedInput = tool.input;
  }

  return (
    <div className="rounded-lg border border-[#F0E6D8] bg-[#FFF5E6]/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FFF5E6] transition-colors"
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <Wrench className="w-3 h-3 text-[#FAD4C0]" />
        <span className="text-xs font-mono font-medium">{tool.name}</span>
        {statusIcon}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {parsedInput && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input</span>
              <pre className="mt-1 text-[10px] font-mono bg-[#FFFBF5] border rounded-md p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                {parsedInput}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Output</span>
              <pre className="mt-1 text-[10px] font-mono bg-[#FFFBF5] border rounded-md p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
