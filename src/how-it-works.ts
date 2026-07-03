const KEY = 0x2a;

function decode(codes: number[]): string {
  return codes.map((code) => String.fromCharCode(code ^ KEY)).join("");
}

function phrase(): string {
  return decode([
    90, 79, 94, 79, 88, 10, 78, 69, 94, 10, 67, 68, 68, 69, 92, 75, 94, 79, 89, 10,
    75, 94, 10, 77, 71, 75, 67, 70, 10, 78, 69, 94, 10, 73, 69, 71,
  ]);
}

function init(): void {
  const text = phrase();

  for (const el of document.querySelectorAll<HTMLElement>("[data-o]")) {
    el.textContent = text;
  }
}

init();
