import mongoose, { Schema } from "mongoose";

export interface UserDoc extends mongoose.Document {
  nickname: string;
  balanceAvailable: number; // cents
  balanceLocked: number;    // cents
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    nickname: { type: String, required: true, trim: true, unique: true },
    balanceAvailable: { type: Number, required: true, min: 0 },
    balanceLocked: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<UserDoc>("User", UserSchema);
