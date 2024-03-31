export interface LanguageConfig {
    USERNAME_REQUREMENTS: string
    PASSWORD_REQUIREMENTS: string
    INVALID_EMAIL: string
    EMAIL_TAKEN: string
    USERNAME_TAKEN: string
    NO_ACCOUNT_WITH_EMAIL: string
    NO_ACCOUNT_WITH_USERNAME: string
    INCORRECT_PASSWORD: string
    DISPLAYNAME_REQUIREMENTS: string
    USERNAME_CHANGE_COOLDOWN: string
}

export const ENGLISH: LanguageConfig = {
    USERNAME_REQUREMENTS: "Your username must be between 1 and 10 letters, numbers or full stops",
    INVALID_EMAIL: "The entered email is invalid",
    PASSWORD_REQUIREMENTS: "Your password must contain 8 characters and at least one uppercase, one lowercase and one number",
    EMAIL_TAKEN: "That email has already been used",
    USERNAME_TAKEN: "That username has already been used",
    NO_ACCOUNT_WITH_EMAIL: "An account with that email was not found",
    NO_ACCOUNT_WITH_USERNAME: "An account with that username was not found",
    INCORRECT_PASSWORD: "Incorrect password",
    DISPLAYNAME_REQUIREMENTS: "Your display name must be between 3 and 15 characters",
    USERNAME_CHANGE_COOLDOWN: "You can only change your username once every 24 hours."

}