import type { JwtPayload } from 'jsonwebtoken';
import type { FilmDocument } from '../models/film_model';

export interface AuthTokenPayload extends JwtPayload {
  user: {
    id: string;
    username: string;
    usernameKey: string;
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    authData: AuthTokenPayload;
    film: FilmDocument;
  }
}
