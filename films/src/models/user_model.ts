import { HydratedDocument, Schema, model } from 'mongoose';

export interface User {
  username: string;
  usernameKey: string;
  passwordHash: string;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    username: { type: String, required: true, trim: true },
    usernameKey: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    passwordHash: { type: String, required: true, select: false }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, user) => {
        Reflect.deleteProperty(user, 'usernameKey');
        Reflect.deleteProperty(user, 'passwordHash');
        Reflect.deleteProperty(user, '__v');
        return user;
      }
    }
  }
);

export default model<User>('User', userSchema);
