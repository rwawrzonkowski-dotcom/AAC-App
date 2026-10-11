// Turns a whole number into English words, for the number pad.
//   numberToWords(24)    -> "twenty-four"
//   numberToWords(105)   -> "one hundred five"
//   numberToWords(2026)  -> "two thousand twenty-six"
//   numberToWords(0)     -> "zero"
// Works for 0 to 999,999. There is no "and" ("one hundred five", not "one hundred and five").
// The number pad shows the digits on the chip and SPEAKS these words.
// Tests: node tools/test-numberwords.mjs

export const MAX_DIGITS = 6;   // the number pad refuses a 7th digit

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// 1 to 999 as words (no zero: it is left out inside bigger numbers).
function below1000(n) {
  const out = [];
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)], "hundred"); n %= 100; }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)];
    out.push(n % 10 ? `${t}-${ONES[n % 10]}` : t);
  } else if (n > 0) {
    out.push(ONES[n]);
  }
  return out.join(" ");
}

export function numberToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999999) throw new RangeError("numberToWords: 0 to 999999 only");
  if (n === 0) return "zero";
  const thousands = Math.floor(n / 1000), rest = n % 1000;
  return [thousands ? below1000(thousands) + " thousand" : "", rest ? below1000(rest) : ""].filter(Boolean).join(" ");
}

// Digits typed on the pad ("24", "0") -> the words to speak. Leading zeros do not matter.
export function digitsToWords(digits) {
  return numberToWords(parseInt(String(digits), 10) || 0);
}
