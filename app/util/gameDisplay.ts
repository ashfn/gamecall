import type { GameLobby, GameType } from "./types";

export function gameDisplayName(type: GameType): string {
  if (type === "WORD_DROP") return "Word Drop";
  if (type === "EIGHT_BALL") return "8 Ball";
  if (type === "NUMBER_DROP") return "Number Drop";
  if (type === "CHESS") return "Chess";
  return "Tic Tac Toe";
}

export function gameIconName(type: GameType): "font" | "circle" | "calculator" | "th" | "chess-knight" {
  if (type === "WORD_DROP") return "font";
  if (type === "EIGHT_BALL") return "circle";
  if (type === "NUMBER_DROP") return "calculator";
  if (type === "CHESS") return "chess-knight";
  return "th";
}

export function gameLobbyDetail(lobby: GameLobby): string {
  if (lobby.type === "WORD_DROP") {
    return lobby.settings.variant === "MINI" ? "Mini · 11 × 11" : "Regular · 15 × 15";
  }
  if (lobby.type === "NUMBER_DROP") {
    const rounds = lobby.settings.rounds;
    return `${rounds} ${rounds === 1 ? "round" : "rounds"}${lobby.settings.moveTimerSeconds ? ` · ${lobby.settings.moveTimerSeconds / 60} min` : " · No timer"}`;
  }
  if (lobby.type === "EIGHT_BALL") return "Standard 8 Ball";
  if (lobby.type === "CHESS") {
    if (lobby.settings.variant === "CHESS960") return "Chess960 · shuffled back rank";
    if (lobby.settings.variant === "FOG_OF_WAR") return "Fog of War · capture the king";
    return "Standard chess";
  }
  return "Classic · 3 × 3";
}
