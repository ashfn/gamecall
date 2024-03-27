import { authenticateToken } from "../middleware"
import { getAvatar } from "./profile"
import { Request, Response } from 'express';

export function getAvatarRoute(req: Request, res: Response){
    getAvatar(parseInt(req.params.userId)).then((response) => {
        console.log("Avatar fetched :)")
        if(response.data){
            res.set('Content-Type', 'image/png');
            res.send(Buffer.from(response.data.avatar));
        }else{
            return res.send(JSON.stringify(response))
        }


        // res.send(JSON.stringify(response))
    })
    // res.send(JSON.stringify(res.locals.user))
}
