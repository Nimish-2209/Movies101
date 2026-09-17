import type { AiRecommender, AssistantMessage } from './ai_recommender';
import type { Movie, MovieRouter } from './movie_catalog';

interface ExcludedMovie {
  tmdbId?: number;
  name: string;
}

export interface MovieRecommendation extends Movie {
  reason: string;
}

export interface MovieAssistantResponse {
  reply: string;
  recommendations: MovieRecommendation[];
}

interface RecommendationOptions {
  messages: AssistantMessage[];
  excludedMovies: ExcludedMovie[];
  recommender: AiRecommender;
  movieCatalog: MovieRouter;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function getMovieAssistantResponse({
  messages,
  excludedMovies,
  recommender,
  movieCatalog
}: RecommendationOptions): Promise<MovieAssistantResponse> {
  const excludedIds = new Set(
    excludedMovies.flatMap((movie) =>
      movie.tmdbId === undefined ? [] : [movie.tmdbId]
    )
  );
  const excludedTitles = new Set(
    excludedMovies.map((movie) => normalizeTitle(movie.name))
  );
  const result = await recommender.recommend({
    messages,
    excludedMovies: excludedMovies.map((movie) => movie.name).slice(0, 100)
  });

  const verified = await Promise.all(
    result.candidates.map(async (candidate) => {
      const results = await movieCatalog.searchMovies(candidate.title);
      const normalizedCandidate = normalizeTitle(candidate.title);
      const exactMatches = results.filter(
        (movie) => normalizeTitle(movie.title) === normalizedCandidate
      );
      const movie =
        exactMatches.find(
          (result) =>
            Number(result.releaseDate.slice(0, 4)) === candidate.releaseYear
        ) ?? exactMatches[0];

      if (
        !movie ||
        excludedIds.has(movie.id) ||
        excludedTitles.has(normalizeTitle(movie.title))
      ) {
        return null;
      }
      return { ...movie, reason: candidate.reason };
    })
  );

  const unique = new Map<number, MovieRecommendation>();
  for (const movie of verified) {
    if (movie) unique.set(movie.id, movie);
  }
  return {
    reply: result.reply,
    recommendations: Array.from(unique.values()).slice(0, 3)
  };
}
