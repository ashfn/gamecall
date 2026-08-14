"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = exports.userError = exports.clientError = exports.getResultString = exports.ActionStatus = void 0;
var ActionStatus;
(function (ActionStatus) {
    ActionStatus[ActionStatus["USER_ERROR"] = -1] = "USER_ERROR";
    ActionStatus[ActionStatus["CLIENT_ERROR"] = 0] = "CLIENT_ERROR";
    ActionStatus[ActionStatus["SUCCESS"] = 1] = "SUCCESS";
})(ActionStatus || (exports.ActionStatus = ActionStatus = {}));
function getResultString(result) {
    return JSON.stringify(result);
}
exports.getResultString = getResultString;
function clientError(message) {
    return {
        status: ActionStatus.CLIENT_ERROR,
        error: message
    };
}
exports.clientError = clientError;
function userError(message) {
    return {
        status: ActionStatus.USER_ERROR,
        error: message
    };
}
exports.userError = userError;
function success(data) {
    return {
        status: ActionStatus.SUCCESS,
        data: data
    };
}
exports.success = success;
