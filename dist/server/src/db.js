import mongoose from "mongoose";
export async function connectDb(mongoUri) {
    mongoose.set("strictQuery", true);
    await mongoose.connect(mongoUri, {
        autoIndex: true,
    });
    return mongoose.connection;
}
export function startSession() {
    return mongoose.startSession();
}
