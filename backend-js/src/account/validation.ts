export function validUsername(username: string): boolean {
    return /^[a-zA-Z0-9.]{1,10}$/.test(username)
}

export function validPassword(username: string): boolean {
    return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,50}$/.test(username)
}

export function validEmail(username: string): boolean {
    return /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,50}$/.test(username)
}

export function validDisplayName(displayname: string): boolean {
    return /^.{3,15}$/.test(displayname)
}