"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unregisterPushTokenRoute = exports.registerPushTokenRoute = void 0;
const expo_server_sdk_1 = require("expo-server-sdk");
const __1 = require("..");
const status_1 = require("../status");
const platforms = new Set(["ios", "android"]);
async function registerPushTokenRoute(req, res) {
    const user = res.locals.user;
    const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
    const platform = typeof req.body.platform === "string" ? req.body.platform.trim().toLowerCase() : "";
    const deviceName = typeof req.body.deviceName === "string" ? req.body.deviceName.trim().slice(0, 120) : null;
    if (!expo_server_sdk_1.Expo.isExpoPushToken(token))
        return res.send((0, status_1.clientError)("Invalid push token"));
    if (!platforms.has(platform))
        return res.send((0, status_1.clientError)("Invalid device platform"));
    await __1.prisma.pushToken.upsert({
        where: { token },
        create: { token, userId: user.id, platform, deviceName: deviceName || null },
        update: { userId: user.id, platform, deviceName: deviceName || null },
    });
    return res.send((0, status_1.success)());
}
exports.registerPushTokenRoute = registerPushTokenRoute;
async function unregisterPushTokenRoute(req, res) {
    const user = res.locals.user;
    const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
    if (!token)
        return res.send((0, status_1.clientError)("Invalid push token"));
    await __1.prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
    return res.send((0, status_1.success)());
}
exports.unregisterPushTokenRoute = unregisterPushTokenRoute;
