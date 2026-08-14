"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validDisplayName = exports.validEmail = exports.validPassword = exports.validUsername = void 0;
function validUsername(username) {
    return /^[a-zA-Z0-9.]{1,10}$/.test(username);
}
exports.validUsername = validUsername;
function validPassword(username) {
    return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,50}$/.test(username);
}
exports.validPassword = validPassword;
function validEmail(username) {
    return /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,50}$/.test(username);
}
exports.validEmail = validEmail;
function validDisplayName(displayname) {
    return /^.{3,15}$/.test(displayname);
}
exports.validDisplayName = validDisplayName;
