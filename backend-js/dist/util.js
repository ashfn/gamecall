"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimeEpoch = void 0;
function getTimeEpoch() {
    return Math.round(+new Date() / 1000);
}
exports.getTimeEpoch = getTimeEpoch;
