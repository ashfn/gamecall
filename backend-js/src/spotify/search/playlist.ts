import { Request, Response } from "express";
import { spotifyApi } from "../..";
import { clientError } from "../../status";
import { MARKET } from "../config";

export async function searchPlaylistRoute(req: Request, res: Response){
    if(!req.query.playlist){
        return res.send(clientError("Missing playlist parameter"))
    }

    const playlists = await spotifyApi.search(req.query.playlist as string, ["playlist"], {
        limit: 50,
        market: MARKET
    })

    const playlistsReturn: any[] = []

    playlists.body.playlists?.items.forEach((item) => {

        const img = item.images[0]

        playlistsReturn.push({
            name: item.name,
            id: item.id,
            image: img,
            tracks: item.tracks.total,
            creator: item.owner.display_name,
            type: "PLAYLIST"
        })
    })

    return res.send(playlistsReturn)
}