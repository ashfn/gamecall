"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBase64Profile = void 0;
function fetchAndConvertToBase64(url) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(url);
            const arrayBuffer = yield response.arrayBuffer();
            const base64data = arrayBufferToBase64(arrayBuffer);
            return base64data;
        }
        catch (error) {
            console.error('Error fetching and converting to Base64:', error);
            throw error;
        }
    });
}
function arrayBufferToBase64(arrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
/**
 *   Username must be validated before being used here!!!!!
 * */
function getBase64Profile(username) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const base64 = yield fetchAndConvertToBase64(`https://ui-avatars.com/api/?background=96e396&color=0a0a0a&name=${username}&size=512`);
            return base64;
        }
        catch (error) {
            throw error;
        }
    });
}
exports.getBase64Profile = getBase64Profile;
