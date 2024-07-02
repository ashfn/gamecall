import express, { Request, Response } from 'express';

import { PrismaClient, Role, User } from '@prisma/client'
import { register, login, refreshToken, logout } from './account/account';
import dotenv from "dotenv"
import { authenticateToken, userDetails, userFullContext } from './middleware';
import { getAvatarRoute, searchProfilesRoute, setAvatarRoute, setDisplayNameRoute, setUsernameRoute, getProfileRoute } from './profile/profileRoute';
import { acceptFriendRequestRoute, addFriendRequestRoute, denyFriendRequestRoute, getConnectionsRoute, getFriendRequestsRoute, removeFriendRoute } from './friends/friendRoutes';
import { success } from './status';
import { endGameRoute, getActiveGamesRoute, sendGameRoute, updateGameRoute } from './game/gameRoutes';
import { TIC_TAC_TOE } from './game/gamestate/games/TIC_TAC_TOE';

dotenv.config()

export const prisma = new PrismaClient()

const app = express();

app.use(express.json({limit: '2mb'}));

const port = process.env.PORT || 3000;
// passworAd1
app.get('/', (req: Request, res: Response) => {
    const allUsers = prisma.user.findMany().then((users) => {
        res.send(JSON.stringify(users));
    })
});

app.post('/account', (req: Request, res: Response) => {
    register(req.body.username, req.body.email, req.body.password).then((user) => {
        res.send(JSON.stringify(user))
    })
})

app.post('/login', (req: Request, res: Response) => {
    login(req.body.account, req.body.password).then((user) => {
        res.send(JSON.stringify(user))
    })
})

app.post('/refresh', (req: Request, res: Response) => {
    refreshToken(req.body.refreshToken).then((accessToken) => {
        res.send(JSON.stringify(accessToken))
    })
})

app.get('/debug', [authenticateToken, userDetails], (req: Request, res: Response) => {
    const user: User = res.locals.user
    if(user.role==Role.ADMIN){
        res.send("Super secret thing!!")
    }else{
        res.send(JSON.stringify(res.locals.user))
    }
})

app.get('/account', [authenticateToken, userDetails], (req: Request, res: Response) => {
    res.send(JSON.stringify(success(res.locals.user)))
})

app.post('/profile/:userId/avatar', [authenticateToken, userDetails], setAvatarRoute)
app.get('/profile/:userId/', [authenticateToken], getProfileRoute)
app.get('/profile/:userId/avatar', [], getAvatarRoute)
app.post('/profile/:userId/displayname', [authenticateToken, userDetails], setDisplayNameRoute)
app.post('/profile/:userId/username', [authenticateToken, userDetails], setUsernameRoute)
app.post('/friendRequest/:userId', [authenticateToken, userFullContext], addFriendRequestRoute)
app.get('/friendRequests', [authenticateToken, userDetails], getFriendRequestsRoute)
app.post('/removeFriend/:userId', [authenticateToken, userDetails], removeFriendRoute)
app.get('/connections', [authenticateToken, userDetails], getConnectionsRoute)
app.post('/denyFriendRequest/:userId', [authenticateToken, userDetails], denyFriendRequestRoute)
app.post('/acceptFriendRequest/:userId', [authenticateToken, userDetails], acceptFriendRequestRoute)
app.post('/searchProfiles', [authenticateToken], searchProfilesRoute)
app.post('/newGame', [authenticateToken, userDetails], sendGameRoute)
app.post('/endGame', [authenticateToken, userDetails], endGameRoute)
app.post('/updateGame', [authenticateToken, userDetails], updateGameRoute)
app.get('/games', [authenticateToken, userDetails], getActiveGamesRoute)
app.use('/assets', express.static('public'))

app.get('/logout', authenticateToken, (req: Request, res: Response) => {
    const user: User = res.locals.user
    logout(user.id).then((data) => {
        res.send(JSON.stringify(data))
    })
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});