import express, { Request, Response } from 'express';

import { PrismaClient, Role, User } from '@prisma/client'
import { register, login, refreshToken, logout } from './account/account';
import dotenv from "dotenv"
import { authenticateToken, userDetails, userFullContext } from './middleware';
import { getAvatarRoute, setAvatarRoute, setDisplayNameRoute, setUsernameRoute } from './profile/profileRoute';
import { addFriendRequestRoute, denyFriendRequestRoute, getConnectionsRoute, getFriendRequestsRoute } from './friends/friendRoutes';

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
        console.log(user)
        res.send(JSON.stringify(user))
    })
})

app.post('/login', (req: Request, res: Response) => {
    login(req.body.account, req.body.password).then((user) => {
        console.log(user)
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
    console.log(res.locals.user)
    res.send(JSON.stringify(res.locals.user))
})

app.post('/profile/:userId/avatar', [authenticateToken, userDetails], setAvatarRoute)

// app.get('/profile/:userId/', [authenticateToken], getProfileRoute)
app.get('/profile/:userId/avatar', [], getAvatarRoute)

app.post('/profile/:userId/displayname', [authenticateToken, userDetails], setDisplayNameRoute)

app.post('/profile/:userId/username', [authenticateToken, userDetails], setUsernameRoute)

app.post('/friendRequest/:userId', [authenticateToken, userFullContext], addFriendRequestRoute)

app.get('/friendRequests', [authenticateToken, userDetails], getFriendRequestsRoute)

app.get('/connections', [authenticateToken, userDetails], getConnectionsRoute)

app.post('/denyFriendRequest/:userId', [authenticateToken, userDetails], denyFriendRequestRoute)


app.get('/logout', authenticateToken, (req: Request, res: Response) => {
    const user: User = res.locals.user
    logout(user.id).then((data) => {
        res.send(JSON.stringify(data))
    })
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});