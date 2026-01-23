import mongoose, { Schema } from "mongoose";
const UserSchema = new Schema({
    nickname: { type: String, required: true, trim: true, unique: true },
    balanceAvailable: { type: Number, required: true, min: 0 },
    balanceLocked: { type: Number, required: true, min: 0 },
}, { timestamps: true });
export const UserModel = mongoose.model("User", UserSchema);
