import { rateLimit } from 'express-rate-limit';
import { AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS } from '../config';

export const aiRateLimit = rateLimit({
  windowMs: AI_RATE_LIMIT_WINDOW_MS,
  limit: AI_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'The projectionist needs a breather. Try again in a minute.'
  }
});
