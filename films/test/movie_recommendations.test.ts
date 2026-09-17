import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiRecommender } from '../src/services/ai_recommender';
import type { MovieRouter } from '../src/services/movie_catalog';
import { getMovieAssistantResponse } from '../src/services/movie_recommendations';

test('assistant suggestions must match real catalog movies and avoid the shelf', async () => {
  const recommender: AiRecommender = {
    async recommend() {
      return {
        reply: 'Three reels entered; only one survived verification.',
        candidates: [
          { title: 'Arrival', releaseYear: 2016, reason: 'Already owned.' },
          { title: 'Moon', releaseYear: 2009, reason: 'Quiet lunar mystery.' },
          { title: 'Made Up Movie', releaseYear: 2020, reason: 'Not real.' }
        ]
      };
    }
  };
  const movieCatalog = {
    async searchMovies(query: string) {
      if (query === 'Arrival') {
        return [
          {
            id: 329865,
            title: 'Arrival',
            releaseDate: '2016-11-11',
            overview: '',
            posterUrl: null
          }
        ];
      }
      if (query === 'Moon') {
        return [
          {
            id: 17431,
            title: 'Moon',
            releaseDate: '2009-06-12',
            overview: '',
            posterUrl: '/moon.jpg'
          }
        ];
      }
      return [];
    }
  } as unknown as MovieRouter;

  const result = await getMovieAssistantResponse({
    messages: [{ role: 'user', content: 'What should I watch?' }],
    excludedMovies: [{ name: 'Arrival', tmdbId: 329865 }],
    recommender,
    movieCatalog
  });

  assert.equal(
    result.reply,
    'Three reels entered; only one survived verification.'
  );
  assert.deepEqual(
    result.recommendations.map(({ id, title, reason }) => ({
      id,
      title,
      reason
    })),
    [{ id: 17431, title: 'Moon', reason: 'Quiet lunar mystery.' }]
  );
});
