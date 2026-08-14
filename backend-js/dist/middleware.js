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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userFullContext = exports.userDetails = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const _1 = require(".");
const status_1 = require("./status");
const authenticatedUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    displayName: true,
    usernameLastChanged: true,
    accountCreated: true,
    lastOnline: true,
};
function databaseUnavailable(res, error) {
    console.error("Could not load authenticated user", error);
    if (!res.headersSent) {
        return res.status(503).send((0, status_1.clientError)("Rainfrog is temporarily busy. Please try again."));
    }
}
function authenticateToken(req, res, next) {
    const token = req.header('authorization');
    if (token == null)
        return res.status(499).send();
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error("No JWT secret provided so cancelling JWT creation");
        return res.status(499).send();
    }
    jsonwebtoken_1.default.verify(token.replace(/^Bearer\s+/i, ""), secret, (err, user) => {
        if (err) {
            return res.status(499).send();
        }
        res.locals.userId = user.id;
        next();
    });
}
exports.authenticateToken = authenticateToken;
function userDetails(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!res.locals.userId) {
            console.error("UserDetails middleware used without previous authenticateToken middleware");
            return res.status(499).send();
        }
        try {
            const first = yield _1.prisma.user.findUnique({
                where: {
                    id: res.locals.userId
                },
                select: authenticatedUserSelect,
            });
            if (first == null) {
                console.error("Supplied userId does not exist in database (Normally this happens when a user's account is deleted but their JWT is still valid");
                return res.status(499).send();
            }
            res.locals.user = first;
            next();
        }
        catch (error) {
            return databaseUnavailable(res, error);
        }
    });
}
exports.userDetails = userDetails;
function userFullContext(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!res.locals.userId) {
            console.error("UserDetails middleware used without previous authenticateToken middleware");
            return res.status(499).send();
        }
        try {
            const first = yield _1.prisma.user.findUnique({
                where: {
                    id: res.locals.userId
                },
                select: Object.assign(Object.assign({}, authenticatedUserSelect), { requestsReceived: true, requestsSent: true })
            });
            if (first == null) {
                console.error("Supplied userId does not exist in database (Normally this happens when a user's account is deleted but their JWT is still valid");
                return res.status(499).send();
            }
            res.locals.user = first;
            next();
        }
        catch (error) {
            return databaseUnavailable(res, error);
        }
    });
}
exports.userFullContext = userFullContext;
