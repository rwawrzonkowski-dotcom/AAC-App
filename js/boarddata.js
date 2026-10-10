// Loads data/core-board.json once and shares it with every other file.
let board = null;
let loading = null;

export function loadBoardData() {
  if (!loading) loading = fetch("data/core-board.json").then((r) => r.json()).then((b) => (board = b));
  return loading;
}

// Only call after loadBoardData() has finished.
export const getBoardData = () => board;
