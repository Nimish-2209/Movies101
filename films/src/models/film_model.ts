import { HydratedDocument, Schema, model } from 'mongoose';

export interface Film {
  name: string;
  nameKey: string;
  tmdbId?: number;
  releaseDate?: string;
  posterUrl?: string | null;
  rating?: number;
  watched: boolean;
  favorite: boolean;
  owner: string;
  ownerKey: string;
}

export type FilmDocument = HydratedDocument<Film>;

const filmSchema = new Schema<Film>(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, select: false },
    tmdbId: { type: Number, min: 1 },
    releaseDate: String,
    posterUrl: String,
    rating: { type: Number, min: 0, max: 10 },
    watched: { type: Boolean, default: false },
    favorite: { type: Boolean, default: false },
    owner: { type: String, required: true, trim: true },
    ownerKey: { type: String, required: true, select: false }
  },
  {
    toJSON: {
      transform: (_document, film) => {
        Reflect.deleteProperty(film, 'nameKey');
        Reflect.deleteProperty(film, 'ownerKey');
        Reflect.deleteProperty(film, '__v');
        return film;
      }
    }
  }
);

filmSchema.index(
  { ownerKey: 1, nameKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ownerKey: { $type: 'string' },
      nameKey: { $type: 'string' }
    }
  }
);

export default model<Film>('Film', filmSchema);
