import { prisma, spotifyApi } from "..";
import cron from 'node-cron'

export async function setNewToken(access_token: string, refresh_token: string){
  prisma.spotifyToken.upsert({
    where: {
      id: "spotify"
    },
    update: {
        id: "spotify",
        accessToken: access_token,
        refreshToken: refresh_token,
        expires: new Date().getTime()+(3600*1000)
    },
    create: {
      id: "spotify",
      accessToken: access_token,
      refreshToken: refresh_token,
      expires: new Date().getTime()+(3600*1000)
  }
  }).then((token) => {
      spotifyApi.setAccessToken(token.accessToken)
      spotifyApi.setRefreshToken(token.refreshToken)
  })
}

export async function loginSpotify(){

  const token = await prisma.spotifyToken.findFirst()

  if(token==null){
    var authorizeURL = spotifyApi.createAuthorizeURL(['user-read-private', 'user-read-email'], "");
    console.log(`YOU MUST LOG INTO YOUR SPOTIFY ACCOUNT TO ENABLE THE APP! ${authorizeURL}`)
  }else{

    spotifyApi.setRefreshToken(token.refreshToken)
    spotifyApi.setAccessToken(token.accessToken)

    if(new Date().getTime() > Number(token.expires)){
      console.log(`Refreshing access token (startup)`)
      spotifyApi.refreshAccessToken().then((res) => {
        console.log(JSON.stringify(res))
        if(res.body.access_token){
          setNewToken(res.body.access_token, token.refreshToken)
        }else{
          console.log(`Issue encountered refreshing access token`)
          process.exit(1)
        }
      })
    }
  }

  cron.schedule("*/1 * * * *", () => {
    prisma.spotifyToken.findFirst().then((token) => {
      if(token!=null){
        const expires =  Number(token?.expires)
        console.log(`Token expires in ${expires-new Date().getTime()}`)
        console.log(expires<10000)
        if(expires<10000){
          console.log(`Refreshing access token (scheduled)`)
          spotifyApi.refreshAccessToken().then((res) => {
            console.log(JSON.stringify(res))
            if(res.body.access_token){
              setNewToken(res.body.access_token, token.refreshToken)
            }else{
              console.log(`Issue encountered refreshing access token`)
              process.exit(1)
            }
          })
        }
      }
    })
  })
    // spotifyApi.clientCredentialsGrant().then(
    //     function(data) {
    //       console.log('The access token expires in ' + data.body['expires_in']);
    //       console.log('The access token is ' + data.body['access_token']);
      
    //       // Save the access token so that it's used in future calls
    //       spotifyApi.setAccessToken(data.body['access_token']);
    //     },
    //     function(err) {
    //       console.log('Something went wrong when retrieving an access token', err);
    //     }
    //   );

}