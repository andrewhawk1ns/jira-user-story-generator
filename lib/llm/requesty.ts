/**
 * lib/llm/requesty.ts — server-only
 *
 * Thin wrapper around the Requesty API (OpenAI-compatible endpoint).
 * All LLM and audio transcription calls go through this module.
 */

const REQUESTY_BASE_URL = 'https://router.requesty.ai/v1'

function getHeaders() {
  const key = process.env.REQUESTY_API_KEY
  if (!key) throw new Error('REQUESTY_API_KEY env var is not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json_object' | 'text'
}

/**
 * Send a chat completion request to Requesty.
 * Returns the content of the first choice message.
 */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const {
    model = 'openai/gpt-4o',
    temperature = 0.3,
    maxTokens = 4096,
    responseFormat = 'text',
  } = options

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }

  if (responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch(`${REQUESTY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Requesty chat error ${response.status}: ${text}`)
  }

  const data = await response.json()
  const content: string = data.choices?.[0]?.message?.content

  if (!content) throw new Error('Requesty returned empty content')
  return content
}

/**
 * Transcribe audio via Requesty (Whisper model).
 * Accepts a File/Blob representing audio data.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  filename = 'recording.webm'
): Promise<string> {
  const key = process.env.REQUESTY_API_KEY
  if (!key) throw new Error('REQUESTY_API_KEY env var is not set')

  const form = new FormData()
  form.append('file', audioBlob, filename)
  form.append('model', 'openai/whisper-1')

  const response = await fetch(`${REQUESTY_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Requesty transcription error ${response.status}: ${text}`)
  }

  const data = await response.json()
  const text: string = data.text
  if (!text) throw new Error('Requesty transcription returned empty text')
  return text
}
