import mongoose, { Schema } from "mongoose";
const BidSchema = new Schema({
    auctionId: { type: Schema.Types.ObjectId, required: true, ref: "Auction", index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, default: "active" },
    wonSerial: { type: Number, required: false },
}, { timestamps: true });
BidSchema.index({ auctionId: 1, userId: 1 }, { unique: true });
BidSchema.index({ auctionId: 1, status: 1, amount: -1, updatedAt: 1 });
export const BidModel = mongoose.model("Bid", BidSchema);
