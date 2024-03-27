import express, { Request, Response } from 'express';

import { PrismaClient, Role, User } from '@prisma/client'
import { register, login, refreshToken, logout } from './account';
import dotenv from "dotenv"
import { authenticateToken, userDetails } from './middleware';
import { getAvatarRoute } from './profile/profileRoute';

dotenv.config()

export const prisma = new PrismaClient()

const app = express();

app.use(express.json());

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
    res.send(JSON.stringify(res.locals.user))
})

// app.get('/profile/:userId/', [authenticateToken], getProfileRoute)
app.get('/avatar/:userId/', [], getAvatarRoute)


app.get('/logout', authenticateToken, (req: Request, res: Response) => {
    const user: User = res.locals.user
    logout(user.id).then((data) => {
        res.send(JSON.stringify(data))
    })
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});