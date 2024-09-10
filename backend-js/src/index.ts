import express, { Request, Response } from 'express';

import { PrismaClient, Role, User } from '@prisma/client'
import { register, login, refreshToken, logout } from './account/account';
import dotenv from "dotenv"
import { authenticateToken, userDetails, userFullContext } from './middleware';
import { getAvatarRoute, searchProfilesRoute, setAvatarRoute, setDisplayNameRoute, setUsernameRoute, getProfileRoute } from './profile/profileRoute';
import { acceptFriendRequestRoute, addFriendRequestRoute, denyFriendRequestRoute, getConnectionsRoute, getFriendRequestsRoute, removeFriendRoute } from './friends/friendRoutes';
import { success } from './status';
import { endGameRoute, finishGameRoute, getActiveGamesRoute, sendGameRoute, updateGameRoute } from './game/gameRoutes';
import { TIC_TAC_TOE } from './game/gamestate/games/TIC_TAC_TOE';
import SpotifyWebApi from 'spotify-web-api-node';
import { searchArtistRoute } from './spotify/search/artist';
import { loginSpotify, setNewToken } from './spotify/login';
import { searchAlbumRoute } from './spotify/search/album';
import { searchPlaylistRoute } from './spotify/search/playlist';
import { pickSongFromAlbum, pickSongFromArtist, pickSongFromPlaylist } from './spotify/game/init';

dotenv.config()

export const prisma = new PrismaClient()

const app = express();

app.use(express.json({limit: '2mb'}));

export const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: 'http://localhost:3000/callback'
})

console.log("Getting spotify access token...")
loginSpotify()

if(process.env.DEV){
    app.get('/callback', (req: Request, res: Response) => {
        const code = req.query.code
    
        spotifyApi.authorizationCodeGrant(code as string).then((data) => {
            const token = data.body
            console.log(JSON.stringify(token))
            if(token.access_token){
                setNewToken(token.access_token, token.refresh_token)
              }else{
                console.log(`Issue encountered refreshing access token`)
                process.exit(1)
              }
            },
            (err) => {
              console.log('Something went wrong getting refresh token', err);
            }
          );
    
        console.log(`got code ${code}`)
    });
}

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
app.post('/finishGame', [authenticateToken, userDetails], finishGameRoute)
app.get('/games', [authenticateToken, userDetails], getActiveGamesRoute)

app.get('/spotify/artist', searchArtistRoute)
app.get('/spotify/album', searchAlbumRoute)
app.get('/spotify/playlist', searchPlaylistRoute)

app.get('/test', (req: Request, res: Response) => {
    // 78bpIziExqiI9qztvNFlQu
    pickSongFromPlaylist("37i9dQZF1DZ06evO4BaAkp").then((result) => {
        return res.send(JSON.stringify(result))
    })
    // pickSongFromArtist("7Ln80lUS6He07XvHI8qqHH", "Arctic Monkeys").then((result) => {
    //     return res.send(JSON.stringify(result))
    // })
})

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