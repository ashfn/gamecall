"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBase64Profile = void 0;
async function fetchAndConvertToBase64(url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const base64data = arrayBufferToBase64(arrayBuffer);
        return base64data;
    }
    catch (error) {
        console.error('Error fetching and converting to Base64:', error);
        throw error;
    }
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
async function getBase64Profile(username) {
    try {
        const base64 = await fetchAndConvertToBase64(`https://ui-avatars.com/api/?background=96e396&color=0a0a0a&name=${username}&size=512`);
        return base64;
    }
    catch (error) {
        throw error;
    }
}
exports.getBase64Profile = getBase64Profile;
