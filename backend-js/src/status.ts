export enum ActionStatus {
    USER_ERROR = -1,
    CLIENT_ERROR = 0,
    SUCCESS = 1
}

export interface ActionResult {
    status: ActionStatus
    error?: string
    data?: any
}

export function getResultString(result: ActionResult): string{
    return JSON.stringify(result)
}

export function clientError(message: string): ActionResult{
    return {
        status:ActionStatus.CLIENT_ERROR,
        error: message
    }
}

export function userError(message: string): ActionResult{
    return {
        status:ActionStatus.USER_ERROR,
        error: message
    }
}

export function success(data?: any): ActionResult{
    return {
        status: ActionStatus.SUCCESS,
        data: data
    }
}