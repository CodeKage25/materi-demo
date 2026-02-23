import OpenAI from 'openai'

export const AI_MODEL = process.env.OPENAI_MODEL_CHAT ?? 'gpt-4o'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
})


export const AGENT_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'replace_document',
      description: 'Replace the entire document content with new content. Use when the user asks to rewrite, restructure, or completely redo the document.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'New document title',
          },
          content: {
            type: 'string',
            description: 'New document content in plain text / markdown. Use # for H1, ## for H2, **bold**, *italic*, - for bullets.',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_to_document',
      description: 'Append new content to the end of the document. Use when the user asks to add, extend, or continue the document.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Content to append in plain text / markdown.',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_edit',
      description: 'Suggest a specific text replacement in the document. Use when the user asks to improve, fix, or change a specific part.',
      parameters: {
        type: 'object',
        properties: {
          original: {
            type: 'string',
            description: 'The exact text to replace (must exist verbatim in the document)',
          },
          replacement: {
            type: 'string',
            description: 'The improved replacement text',
          },
          reason: {
            type: 'string',
            description: 'Brief explanation of why this edit improves the document',
          },
        },
        required: ['original', 'replacement', 'reason'],
      },
    },
  },
]

export function buildAgentSystemPrompt(
  documentTitle: string,
  documentContent: string,
  callerName: string,
  collaborators: string[] = [],
): string {
  const contentPreview = documentContent?.slice(0, 4000) || 'Empty document'
  const collaboratorLine = collaborators.length > 0
    ? `Other collaborators currently editing: ${collaborators.join(', ')}.`
    : 'No other collaborators are editing right now.'

  return `You are a collaborative AI agent embedded in a real-time document editor shared by multiple users. You are not a passive chatbot — you are an active co-author with direct edit access.

You are speaking with: ${callerName}
${collaboratorLine}

Current document: "${documentTitle}"

Document content:
---
${contentPreview}
---

You have three tools:
- replace_document — rewrite the entire document (use when asked to rewrite, restructure, or redo)
- append_to_document — add content to the end (use when asked to add, extend, or continue)
- suggest_edit — targeted find-and-replace for a specific passage (use when asked to fix or improve a specific part)

Rules:
1. When the user asks you to write, rewrite, improve, expand, fix, or change something — use the appropriate tool immediately. Do not describe what you would do — do it.
2. When answering questions, discussing ideas, or providing analysis — respond in plain text without calling tools.
3. All edits are broadcast to every collaborator in real-time via the CRDT layer. Write as if you're a trusted senior co-author on a shared document, not an assistant for a single user.
4. Be concise and decisive. Never ask "are you sure?" — just act.`
}
