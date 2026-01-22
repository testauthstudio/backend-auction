import mongoose, { Schema } from "mongoose";

export interface UserDoc extends mongoose.Document {
  balanceAvailable: number; // cents
  balanceLocked: number;    // cents
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    balanceAvailable: { type: Number, required: true, min: 0 },
    balanceLocked: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<UserDoc>("User", UserSchema);
