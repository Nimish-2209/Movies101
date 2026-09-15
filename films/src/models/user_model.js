const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true
    },
    usernameKey: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, user) {
        delete user.usernameKey;
        delete user.passwordHash;
        delete user.__v;
        return user;
      }
    }
  }
);

module.exports = mongoose.model('User', UserSchema);
