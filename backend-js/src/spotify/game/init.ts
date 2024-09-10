import { spotifyApi } from "../..";
import { MARKET } from '../config'

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}

async function getSongsArtist(songs: SpotifyApi.TrackObjectFull[], artistName: string, artistId: string, start:number=0){
    console.log(`get songs by ${artistName} with start ${start}`)

    const newSongs = await spotifyApi.search(
        `artist:"${artistName}"`, 
        ["track"],
        {
            limit: 50,
            offset: start,
            market: MARKET
        }
    )

    if(newSongs.body.tracks?.items==undefined){
        throw new Error("Tracks is undefined!")
    }

    songs.push.apply(songs, newSongs.body.tracks?.items)

    let done = false

    newSongs.body.tracks.items.forEach((track) => {
        if(!(track.artists.map((a) => a.id).includes(artistId))){
            done=true
        }
    })

    if(newSongs.body.tracks.next!=null && !done){
        return await getSongsArtist(songs, artistName, artistId, start+50)
    }else{
        return songs
    }
}

async function getSongsPlaylist(songs: SpotifyApi.PlaylistTrackObject[], playlistId: string, start:number=0){

    const tracks = await spotifyApi.getPlaylistTracks(playlistId, {
        market: MARKET,
        limit: 50,
        offset: start
    })

    songs.push.apply(songs, tracks.body.items)

    if(tracks.body.next!=null){
        return await getSongsPlaylist(songs, playlistId, start+50)
    }else{
        return songs
    }

}

export async function pickSongFromAlbum(albumId: string){

    const album = await spotifyApi.getAlbumTracks(albumId, {
        limit: 50,
        market: MARKET
    })

    const album2 = await spotifyApi.getAlbum(albumId, {
        market: MARKET
    })

    const songs = album.body.items

    console.log(`grabbed ${songs.length} songs!`)

    const potentialSongs: any[] = []

    songs.forEach((song) => {
        if(song.duration_ms>30000){

            const img = album2.body.images[0]

            const imgUrl = img==null?null:img.url

            const artists = song.artists.map((artist) => artist.name)

            potentialSongs.push({
                name: song.name,
                id: song.id,
                album: album2.body.name,
                img: imgUrl,
                artists: artists,
                preview: song.preview_url
            })
        }
    })

    if(potentialSongs.length<3){
        return null
    }

    const chosenSong = potentialSongs[getRandomInt(potentialSongs.length)]
    const chosenStart = getRandomInt(20)

    const result = {
        mysterySong: {
            song: chosenSong,
            start: chosenStart
        },
        searchOptions: potentialSongs
    }

    return result
}

export async function pickSongFromArtist(artistId: string, artistName: string){
    
    const songs = await getSongsArtist([], artistName, artistId)
    
    console.log(`grabbed ${songs.length} songs!`)

    const potentialSongs: any[] = []

    songs.forEach((song) => {
        if(song.duration_ms>30000){

            const img = song.album.images[0]

            const imgUrl = img==null?null:img.url

            const artists = song.artists.map((artist) => artist.name)

            potentialSongs.push({
                name: song.name,
                id: song.id,
                album: song.album.name,
                img: imgUrl,
                artists: artists,
                preview: song.preview_url
            })
        }
    })

    if(potentialSongs.length<3){
        return null
    }

    const chosenSong = potentialSongs[getRandomInt(potentialSongs.length)]
    const chosenStart = getRandomInt(20)

    const result = {
        mysterySong: {
            song: chosenSong,
            start: chosenStart
        },
        searchOptions: potentialSongs
    }

    return result
}

export async function pickSongFromPlaylist(playlistId: string){

    const songs = await getSongsPlaylist([], playlistId)

    const potentialSongs: any[] = []

    songs.forEach((song) => {
        const img = song.track?.album.images[0]
        const imgUrl = img==null?null:img.url

        const artists = song.track?.artists.map((artist) => artist.name)

        potentialSongs.push({
            name: song.track?.name,
            id: song.track?.id,
            album: song.track?.album.name,
            img: imgUrl,
            artists: artists,
            preview: song.track?.preview_url
        })
    })

    if(potentialSongs.length<3){
        return null
    }

    const chosenSong = potentialSongs[getRandomInt(potentialSongs.length)]
    const chosenStart = getRandomInt(20)

    const result = {
        mysterySong: {
            song: chosenSong,
            start: chosenStart
        },
        searchOptions: potentialSongs
    }

    return result

}