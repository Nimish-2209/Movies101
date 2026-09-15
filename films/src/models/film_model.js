const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FilmSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    nameKey: {
      type: String,
      required: true,
      select: false
    },
    tmdbId: { type: Number, min: 1 },
    releaseDate: { type: String },
    posterUrl: { type: String },
    rating: {
      type: Number,
      min: 0,
      max: 10
    },
    watched: {
      type: Boolean,
      default: false
    },
    favorite: {
      type: Boolean,
      default: false
    },
    owner: {
      type: String,
      required: true,
      trim: true
    },
    ownerKey: {
      type: String,
      required: true,
      select: false
    }
  },
  {
    toJSON: {
      transform: function(doc, film) {
        delete film.nameKey;
        delete film.ownerKey;
        delete film.__v;
        return film;
      }
    }
  }
);

FilmSchema.index(
  { ownerKey: 1, nameKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ownerKey: { $type: 'string' },
      nameKey: { $type: 'string' }
    }
  }
);

module.exports = mongoose.model('Film', FilmSchema);
