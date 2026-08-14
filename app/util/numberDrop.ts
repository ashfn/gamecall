import type { NumberDropOperation, NumberDropStep } from "./types";

export interface NumberDropWorkingTile {
  id: string;
  value: number;
  expression: string;
  isResult: boolean;
}

export function numberDropOperationSymbol(operation: NumberDropOperation) {
  if (operation === "ADD") return "+";
  if (operation === "SUBTRACT") return "−";
  if (operation === "MULTIPLY") return "×";
  return "÷";
}

export function calculateNumberDropOperation(left: number, right: number, operation: NumberDropOperation): number | null {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left <= 0 || right <= 0) return null;
  let result: number;
  if (operation === "ADD") result = left + right;
  else if (operation === "SUBTRACT") result = left - right;
  else if (operation === "MULTIPLY") result = left * right;
  else {
    if (left % right !== 0) return null;
    result = left / right;
  }
  return Number.isSafeInteger(result) && result > 0 && result <= 100000 ? result : null;
}

export function numberDropScore(distance: number) {
  return Math.max(0, Math.round(100 - 12 * Math.sqrt(Math.max(0, distance))));
}

export function replayNumberDropSteps(numbers: number[], steps: NumberDropStep[]) {
  const available = new Map<string, NumberDropWorkingTile>(
    numbers.map((value, index) => [`n${index}`, { id: `n${index}`, value, expression: String(value), isResult: false }]),
  );
  const validSteps: NumberDropStep[] = [];
  steps.forEach((step, index) => {
    const left = available.get(step.leftId);
    const right = available.get(step.rightId);
    if (!left || !right || left.id === right.id) return;
    const value = calculateNumberDropOperation(left.value, right.value, step.operation);
    if (value === null) return;
    available.delete(left.id);
    available.delete(right.id);
    const id = `r${index}`;
    available.set(id, {
      id,
      value,
      expression: `(${left.expression} ${numberDropOperationSymbol(step.operation)} ${right.expression})`,
      isResult: true,
    });
    validSteps.push(step);
  });
  return { tiles: [...available.values()], validSteps };
}
