import { encode, decode } from "msgpack-lite"

/**
 * 
 * @param object JSON Object to compress. Uncompress using @see decompressObject
 */
export function compressObject(object){
    const packed = encode(object)
    const string = packed.toString('base64')
    return string
}

/**
 * 
 * @param string compressed string. Must have been compressed using @see compressObject
 */
export function decompressObject(string){
    const buffer = Buffer.from(string, "base64")
    const msg = decode(buffer)
    return msg
}