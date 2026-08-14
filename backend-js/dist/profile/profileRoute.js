"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchProfilesRoute = exports.getProfileRoute = exports.setDisplayNameRoute = exports.setUsernameRoute = exports.setAvatarRoute = exports.getAvatarRoute = void 0;
const client_1 = require("@prisma/client");
const profile_1 = require("./profile");
const __1 = require("..");
const util_1 = require("../util");
const status_1 = require("../status");
const validation_1 = require("../account/validation");
const language_1 = require("../language");
function getAvatarRoute(req, res) {
    console.log(`Avatar requested`);
    const target = parseInt(req.params.userId, 10);
    if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
    }
    (0, profile_1.getAvatar)(parseInt(req.params.userId)).then((response) => {
        if (response.status == status_1.ActionStatus.SUCCESS) {
            res.set('Content-Type', 'image/png');
            res.send(Buffer.from(response.data.avatar));
        }
        else {
            return res.send(JSON.stringify(response));
        }
    });
}
exports.getAvatarRoute = getAvatarRoute;
function setAvatarRoute(req, res) {
    const user = res.locals.user;
    const target = parseInt(req.params.userId, 10);
    if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
    }
    // Avatar must be added as JSON Body
    if (!req.body.avatar) {
        return res.send(JSON.stringify((0, status_1.clientError)("Avatar not present in request body")));
    }
    // Target user id must be valid
    if (target == undefined)
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
    if (user.id != target && user.role != client_1.Role.ADMIN) {
        return res.send(JSON.stringify((0, status_1.clientError)("You do not have access to that resource")));
    }
    (0, profile_1.setAvatar)(target, Buffer.from(req.body.avatar, "base64")).then(() => {
        return res.send(JSON.stringify((0, status_1.success)()));
    });
}
exports.setAvatarRoute = setAvatarRoute;
function setUsernameRoute(req, res) {
    const requestUser = res.locals.user;
    const target = parseInt(req.params.userId);
    if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
    }
    // Username must be added as JSON Body
    if (!req.body.username) {
        return res.send(JSON.stringify((0, status_1.clientError)("Username not present in request body")));
    }
    // Target user id must be valid
    if (target == undefined)
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userID")));
    // If they are editing their own avatar
    if (requestUser.id != target && requestUser.role != client_1.Role.ADMIN) {
        return res.send(JSON.stringify((0, status_1.clientError)("You do not have access to that resource")));
    }
    if (!(0, validation_1.validUsername)(req.body.username)) {
        return res.send(JSON.stringify((0, status_1.userError)(language_1.ENGLISH.USERNAME_REQUREMENTS)));
    }
    __1.prisma.user.findFirst({
        where: {
            username: req.body.username
        }
    }).then((searchUser) => {
        if (searchUser != null) {
            return res.send(JSON.stringify((0, status_1.userError)(language_1.ENGLISH.USERNAME_TAKEN)));
        }
        __1.prisma.user.findFirst({
            where: {
                id: target
            }
        }).then((user) => {
            if (user == null) {
                return res.send(JSON.stringify((0, status_1.clientError)("User not found")));
            }
            if ((user.usernameLastChanged + 86400) < (0, util_1.getTimeEpoch)()) {
                (0, profile_1.setUsername)(target, req.body.username).then(() => {
                    res.send(JSON.stringify((0, status_1.success)()));
                });
            }
            else {
                return res.send(JSON.stringify((0, status_1.userError)(language_1.ENGLISH.USERNAME_CHANGE_COOLDOWN)));
            }
        });
    });
}
exports.setUsernameRoute = setUsernameRoute;
function setDisplayNameRoute(req, res) {
    const requestUser = res.locals.user;
    const target = parseInt(req.params.userId);
    if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
    }
    // Displayname must be added as JSON Body
    if (!req.body.displayname) {
        return res.send(JSON.stringify((0, status_1.clientError)("Display name not present in request body")));
    }
    // Target user id must be valid
    if (target == undefined)
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userID")));
    // If they are editing their own avatar
    if (requestUser.id != target && requestUser.role != client_1.Role.ADMIN) {
        return res.send(JSON.stringify((0, status_1.clientError)("You do not have access to that resource")));
    }
    if (req.body.displayname == "unallowed") {
        return res.send(JSON.stringify((0, status_1.userError)("unallowed")));
    }
    if (!(0, validation_1.validDisplayName)(req.body.displayname)) {
        return res.send(JSON.stringify((0, status_1.userError)(language_1.ENGLISH.DISPLAYNAME_REQUIREMENTS)));
    }
    (0, profile_1.setDisplayName)(target, req.body.displayname).then(() => {
        return res.send(JSON.stringify((0, status_1.success)()));
    });
}
exports.setDisplayNameRoute = setDisplayNameRoute;
function getProfileRoute(req, res) {
    const target = parseInt(req.params.userId);
    if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
        return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
    }
    (0, profile_1.getProfile)(target).then((searchResults) => {
        res.send(JSON.stringify((0, status_1.success)(searchResults)));
    });
}
exports.getProfileRoute = getProfileRoute;
function searchProfilesRoute(req, res) {
    if (!req.body.search) {
        return res.send(JSON.stringify((0, status_1.clientError)("Search Query not present")));
    }
    (0, profile_1.searchProfiles)(req.body.search).then((searchResults) => {
        res.send(JSON.stringify((0, status_1.success)(searchResults)));
    });
}
exports.searchProfilesRoute = searchProfilesRoute;
