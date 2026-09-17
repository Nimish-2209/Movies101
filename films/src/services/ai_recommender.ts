import {
  OLLAMA_API_KEY,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_TIMEOUT_MS
} from '../config';

const recommendationSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    recommendations: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          releaseYear: { type: 'integer' },
          reason: { type: 'string' }
        },
        required: ['title', 'releaseYear', 'reason']
      }
    }
  },
  required: ['reply', 'recommendations']
} as const;

export interface RecommendationCandidate {
  title: string;
  releaseYear: number;
  reason: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RecommendationRequest {
  messages: AssistantMessage[];
  excludedMovies: string[];
}

export interface AiRecommendationResult {
  reply: string;
  candidates: RecommendationCandidate[];
}

export interface AiRecommender {
  recommend(request: RecommendationRequest): Promise<AiRecommendationResult>;
}

interface OllamaResponse {
  message?: { content?: unknown };
}

interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class AiRecommendationError extends Error {}

function parseResult(value: unknown): AiRecommendationResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const { reply, recommendations } = value as {
    reply?: unknown;
    recommendations?: unknown;
  };
  if (
    typeof reply !== 'string' ||
    reply.trim().length === 0 ||
    reply.length > 1200 ||
    !Array.isArray(recommendations)
  ) {
    return null;
  }

  const candidates = recommendations
    .flatMap((candidate): RecommendationCandidate[] => {
      if (typeof candidate !== 'object' || candidate === null) return [];
      const { title, releaseYear, reason } = candidate as Record<
        string,
        unknown
      >;
      if (
        typeof title !== 'string' ||
        title.trim().length === 0 ||
        title.length > 200 ||
        !Number.isInteger(releaseYear) ||
        Number(releaseYear) < 1888 ||
        Number(releaseYear) > 2100 ||
        typeof reason !== 'string' ||
        reason.trim().length === 0 ||
        reason.length > 300
      ) {
        return [];
      }
      return [
        {
          title: title.trim(),
          releaseYear: Number(releaseYear),
          reason: reason.trim()
        }
      ];
    })
    .slice(0, 3);
  return { reply: reply.trim(), candidates };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

export function createOllamaRecommender({
  baseUrl = OLLAMA_BASE_URL,
  model = OLLAMA_MODEL,
  apiKey = OLLAMA_API_KEY,
  timeoutMs = OLLAMA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
}: OllamaOptions = {}): AiRecommender {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const endpoint = `${normalizedBaseUrl}/api/chat`;
  const supportsStructuredOutputs =
    !apiKey && !normalizedBaseUrl.startsWith('https://ollama.com');

  return {
    async recommend({ messages, excludedMovies }) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are the Movies101 projectionist, a concise and playful movie chatbot. Answer movie questions directly. When recommendations help, include up to 3 real, released feature films and never include a title in the excluded list. Otherwise return an empty recommendations array. Return only JSON matching this schema: ' +
                  JSON.stringify(recommendationSchema) +
                  '. Excluded movies: ' +
                  JSON.stringify(excludedMovies) +
                  '. Keep the reply under 120 words and each recommendation reason to one sentence.'
              },
              ...messages
            ],
            stream: false,
            ...(supportsStructuredOutputs
              ? { format: recommendationSchema }
              : {}),
            options: { temperature: 0.2 }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch {
        throw new AiRecommendationError(
          'Ollama is unavailable. Start it and try again.'
        );
      }

      if (!response.ok) {
        throw new AiRecommendationError(
          response.status === 404
            ? `Ollama model “${model}” is not installed.`
            : 'Ollama could not generate recommendations.'
        );
      }

      try {
        const data = (await response.json()) as OllamaResponse;
        if (typeof data.message?.content !== 'string') throw new Error();
        const result = parseResult(parseJsonContent(data.message.content));
        if (!result) throw new Error();
        return result;
      } catch {
        throw new AiRecommendationError(
          'Ollama returned an invalid recommendation list.'
        );
      }
    }
  };
}
