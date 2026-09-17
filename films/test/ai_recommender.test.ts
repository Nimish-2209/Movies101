import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AiRecommendationError,
  createOllamaRecommender
} from '../src/services/ai_recommender';

test('local Ollama receives bounded chat history and a response schema', async () => {
  const fetchImpl: typeof fetch = async (input, options) => {
    assert.equal(input.toString(), 'http://127.0.0.1:11434/api/chat');
    assert.equal(new Headers(options?.headers).get('Authorization'), null);
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    assert.equal(body.model, 'granite4.1:3b');
    assert.equal(typeof body.format, 'object');
    assert.deepEqual(
      (body.messages as Array<{ role: string }>).map(({ role }) => role),
      ['system', 'user']
    );
    return Response.json({
      message: {
        content: JSON.stringify({
          reply: 'Cue the fog machine: try Arrival.',
          recommendations: [
            { title: 'Arrival', releaseYear: 2016, reason: 'Smart and moving.' }
          ]
        })
      }
    });
  };
  const recommender = createOllamaRecommender({
    baseUrl: 'http://127.0.0.1:11434/',
    model: 'granite4.1:3b',
    fetchImpl
  });

  const result = await recommender.recommend({
    messages: [{ role: 'user', content: 'Thoughtful sci-fi?' }],
    excludedMovies: ['Interstellar']
  });
  assert.equal(result.reply, 'Cue the fog machine: try Arrival.');
  assert.equal(result.candidates[0].title, 'Arrival');
});

test('Ollama Cloud uses bearer auth without the unsupported format option', async () => {
  const fetchImpl: typeof fetch = async (_input, options) => {
    assert.equal(
      new Headers(options?.headers).get('Authorization'),
      'Bearer cloud-secret'
    );
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    assert.equal(body.model, 'gpt-oss:20b');
    assert.equal(body.format, undefined);
    return Response.json({
      message: {
        content: '```json\n{"reply":"Roll it.","recommendations":[]}\n```'
      }
    });
  };
  const recommender = createOllamaRecommender({
    baseUrl: 'https://ollama.com',
    model: 'gpt-oss:20b',
    apiKey: 'cloud-secret',
    fetchImpl
  });

  assert.deepEqual(
    await recommender.recommend({
      messages: [{ role: 'user', content: 'Hello' }],
      excludedMovies: []
    }),
    { reply: 'Roll it.', candidates: [] }
  );
});

test('invalid model output becomes a safe service error', async () => {
  const recommender = createOllamaRecommender({
    fetchImpl: async () => Response.json({ message: { content: 'not json' } })
  });

  await assert.rejects(
    recommender.recommend({
      messages: [{ role: 'user', content: 'Hello' }],
      excludedMovies: []
    }),
    AiRecommendationError
  );
});
