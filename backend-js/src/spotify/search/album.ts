import { Request, Response } from "express";
import { spotifyApi } from "../..";
import { clientError } from "../../status";
import { MARKET } from "../config";

export async function searchAlbumRoute(req: Request, res: Response){
    if(!req.query.album){
        return res.send(clientError("Missing album parameter"))
    }

    const albums = await spotifyApi.search(req.query.album as string, ["album"], {
        limit: 50,
        market: MARKET
    })

    const albumsReturn: any[] = []

    albums.body.albums?.items.forEach((item) => {

        const img = item.images.filter((img) => img.height==640)[0]

        const artists = item.artists.map((artist) => artist.name)

        albumsReturn.push({
            name: item.name,
            id: item.id,
            image: img,
            tracks: item.total_tracks,
            artists: artists,
            type: "ALBUM"
        })
    })

    return res.send(albumsReturn)
}