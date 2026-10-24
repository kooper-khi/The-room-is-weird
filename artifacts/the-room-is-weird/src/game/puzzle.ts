export type InteractionTarget =
  | "remote"
  | "activate-remote"
  | "hidden-switch"
  | "exit-door"
  | "sofa"
  | "television"
  | "painting"
  | "lamp"
  | "bookshelf";

export interface PuzzleState {
  hasRemote: boolean;
  roomFlipped: boolean;
  switchActivated: boolean;
  doorOpened: boolean;
  complete: boolean;
  inspected: InteractionTarget[];
}

export interface PuzzleResult {
  state: PuzzleState;
  message: string;
  sound: "pickup" | "transform" | "switch" | "door" | "complete" | "comedy" | "denied";
  changed: boolean;
}

export function createPuzzleState(): PuzzleState {
  return {
    hasRemote: false,
    roomFlipped: false,
    switchActivated: false,
    doorOpened: false,
    complete: false,
    inspected: [],
  };
}

export function interactWithPuzzle(
  state: PuzzleState,
  target: InteractionTarget,
): PuzzleResult {
  const next = { ...state, inspected: [...state.inspected] };

  switch (target) {
    case "remote":
      if (state.hasRemote) {
        return result(state, "The remote is already in your pocket. It is making a tiny, confident beep.", "comedy");
      }
      next.hasRemote = true;
      return result(next, "Remote acquired. It has one button and an unreasonable amount of confidence.", "pickup", true);

    case "activate-remote":
      if (!state.hasRemote) {
        return result(state, "The remote is over by the coffee table. It looks like it wants to be found.", "denied");
      }
      if (state.roomFlipped) {
        return result(state, "The remote clicks. Reality considers it, then decides it is already upside down enough.", "comedy");
      }
      next.roomFlipped = true;
      return result(next, "CLICK. The room performs a very enthusiastic somersault.", "transform", true);

    case "hidden-switch":
      if (!state.roomFlipped) {
        return result(state, "A suspicious little switch is tucked somewhere out of reach. Something needs to change first.", "denied");
      }
      if (state.switchActivated) {
        return result(state, "The switch is already on. It hums like it has just solved a difficult puzzle.", "comedy");
      }
      next.switchActivated = true;
      return result(next, "Switch on. The exit gives a polite little click.", "switch", true);

    case "exit-door":
      if (!state.switchActivated) {
        return result(state, "Locked. The door has a note: “Please ask the suspicious switch.”", "denied");
      }
      if (state.complete) {
        return result(state, "The door is open. Beyond it, the room appears to be another slightly different room.", "complete");
      }
      next.doorOpened = true;
      next.complete = true;
      return result(next, "The door swings open. A tiny audience of houseplants applauds.", "complete", true);

    case "sofa":
      return inspect(state, target, "The sofa sighs and straightens one cushion. It insists this was its idea.");
    case "television":
      return inspect(state, target, "The TV is showing a very serious documentary about a sandwich. The sandwich is winning.");
    case "painting":
      return inspect(state, target, state.roomFlipped
        ? "The painting has changed. The portrait is now politely upside down, and still judging your posture."
        : "The portrait blinks. You blink back. It looks away first.");
    case "lamp":
      return inspect(state, target, "The lamp flickers once, then points its shade toward the remote. Subtle.");
    case "bookshelf":
      return inspect(state, target, "A book is titled “How To Be A Shelf.” It is filed under S.");
  }
}

function inspect(
  state: PuzzleState,
  target: InteractionTarget,
  firstMessage: string,
): PuzzleResult {
  if (state.inspected.includes(target)) {
    return result(state, "The room has no further comment. For now.", "comedy");
  }
  const next = { ...state, inspected: [...state.inspected, target] };
  return result(next, firstMessage, "comedy", true);
}

function result(
  state: PuzzleState,
  message: string,
  sound: PuzzleResult["sound"],
  changed = false,
): PuzzleResult {
  return { state, message, sound, changed };
}

export function getHint(state: PuzzleState): string {
  if (!state.hasRemote) return "Look around the coffee table. That remote is definitely not ordinary.";
  if (!state.roomFlipped) return "Try the remote. One button, one room, no idea what could go wrong.";
  if (!state.switchActivated) return "The flip made a new route. Look for a little switch near the upper shelves.";
  if (!state.complete) return "The exit has stopped pretending it is locked. Give the door another try.";
  return "You escaped! The plants would like you to know they rehearsed that applause.";
}

export function getObjective(state: PuzzleState): string {
  if (state.complete) return "Room successfully un-roomed";
  if (!state.hasRemote) return "Find the peculiar remote";
  if (!state.roomFlipped) return "Press the remote";
  if (!state.switchActivated) return "Find the hidden switch";
  return "Open the exit";
}

