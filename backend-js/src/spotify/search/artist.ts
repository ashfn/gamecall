import { Request, Response } from "express";
import { spotifyApi } from "../..";
import { clientError } from "../../status";
import { MARKET } from "../config";

export async function searchArtistRoute(req: Request, res: Response){
    if(!req.query.artist){
        return res.send(clientError("Missing artist parameter"))
    }

    const artists = await spotifyApi.search(req.query.artist as string, ["artist"], {
        limit: 50,
        market: MARKET
    })

    const artistsReturn: any[] = []

    artists.body.artists?.items.forEach((item) => {

        const img = item.images[0]

        artistsReturn.push({
            name: item.name,
            id: item.id,
            image: img,
            followers: item.followers,
            type: "ARTIST"
        })
    })


    return res.send(artistsReturn)
}