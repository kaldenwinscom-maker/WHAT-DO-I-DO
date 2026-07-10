import Anthropic from "@anthropic-ai/sdk";

async function sendClaudeMessage({ apiKey, systemPrompt, messages }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  if (response.stop_reason === "refusal") {
    return "Claude declined to answer that.";
  }

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock ? textBlock.text : "";
}

function classifyClaudeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "That Anthropic API key was rejected.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This Anthropic API key doesn't have access to this model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by Anthropic — try again shortly.";
  if (err instanceof Anthropic.NotFoundError) return "Claude model not found — the app may need updating.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic's API — check your connection.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error: ${err.message}`;
  return (err && err.message) || "Unknown error talking to Claude.";
}

function isClaudeAuthError(err) {
  return err instanceof Anthropic.AuthenticationError;
}

window.ClaudeClient = { sendClaudeMessage, classifyClaudeError, isClaudeAuthError };
