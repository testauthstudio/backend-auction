import mongoose, { Schema } from "mongoose";

export type AuctionStatus = "draft" | "running" | "finished";

export interface AuctionDoc extends mongoose.Document {
  title: string;
  totalItems: number;
  itemsPerRound: number;
  roundDurationSec: number;

  antiSnipeWindowSec: number;
  antiSnipeExtendSec: number;
  maxExtensionsPerRound: number;

  status: AuctionStatus;
  currentRound: number;
  roundEndsAt: Date | null;
  itemsAssigned: number;

  settling: boolean;
  extensionCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const AuctionSchema = new Schema<AuctionDoc>(
  {
    title: { type: String, required: true },

    totalItems: { type: Number, required: true, min: 1 },
    itemsPerRound: { type: Number, required: true, min: 1 },
    roundDurationSec: { type: Number, required: true, min: 5 },

    antiSnipeWindowSec: { type: Number, required: true, min: 0 },
    antiSnipeExtendSec: { type: Number, required: true, min: 0 },
    maxExtensionsPerRound: { type: Number, required: true, min: 0 },

    status: { type: String, required: true, default: "draft" },
    currentRound: { type: Number, required: true, default: 0 },
    roundEndsAt: { type: Date, default: null },
    itemsAssigned: { type: Number, required: true, default: 0 },

    settling: { type: Boolean, required: true, default: false },
    extensionCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

AuctionSchema.index({ status: 1, roundEndsAt: 1, settling: 1 });

export const AuctionModel = mongoose.model<AuctionDoc>("Auction", AuctionSchema);
