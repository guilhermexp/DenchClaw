// DenchClaw Plugin SDK - local types replacing openclaw/plugin-sdk
// This file provides the same interface as the upstream openclaw plugin-sdk
// but is self-contained so DenchClaw can run without the openclaw package.

/**
 * A tool that can be registered by a plugin and made available to the agent.
 */
export type AnyAgentTool = {
  name: string;
  label?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  execute?: (toolCallId: string, args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Context provided to agent lifecycle callbacks.
 */
export type AgentContext = {
  agentId: string;
  sessionId: string;
  workspaceDir: string;
};

/**
 * The plugin API provided to each extension during initialization.
 * Extensions receive this as their first argument and use it to register
 * tools, hooks, and configuration.
 */
export type OpenClawPluginApi = {
  /** Register a tool that the agent can invoke. */
  registerTool: (tool: AnyAgentTool) => void;
  /** Register a callback that fires when an agent run starts. */
  onAgentStart?: (callback: (context: AgentContext) => void) => void;
  /** Register a callback that fires when an agent run ends. */
  onAgentEnd?: (callback: (context: AgentContext) => void) => void;
  /** The plugin's configuration object (from openclaw.json / denchclaw.json). */
  config: Record<string, unknown>;
  /** Path to the mutable state directory (e.g. ~/.denchclaw). */
  stateDir: string;
  /** The active agent ID (usually "main"). */
  agentId: string;
};

/**
 * Type signature for a DenchClaw extension/plugin entry point.
 */
export type PluginInit = (api: OpenClawPluginApi) => void | Promise<void>;
