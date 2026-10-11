// Unit tests for js/numberwords.js (the number pad's number-to-words function).
// Run from the project folder:   node tools/test-numberwords.mjs
// Prints each failure and exits with a non-zero code if any test fails.
import assert from "node:assert/strict";
import { numberToWords, digitsToWords } from "../js/numberwords.js";

const cases = [
  [0, "zero"], [1, "one"], [7, "seven"], [10, "ten"], [11, "eleven"], [12, "twelve"], [13, "thirteen"],
  [15, "fifteen"], [19, "nineteen"], [20, "twenty"], [21, "twenty-one"], [24, "twenty-four"], [30, "thirty"],
  [40, "forty"], [45, "forty-five"], [58, "fifty-eight"], [99, "ninety-nine"],
  [100, "one hundred"], [101, "one hundred one"], [105, "one hundred five"], [110, "one hundred ten"],
  [111, "one hundred eleven"], [120, "one hundred twenty"], [342, "three hundred forty-two"],
  [900, "nine hundred"], [999, "nine hundred ninety-nine"],
  [1000, "one thousand"], [1001, "one thousand one"], [1010, "one thousand ten"], [1100, "one thousand one hundred"],
  [2026, "two thousand twenty-six"], [2500, "two thousand five hundred"], [9999, "nine thousand nine hundred ninety-nine"],
  [10000, "ten thousand"], [12345, "twelve thousand three hundred forty-five"], [20000, "twenty thousand"],
  [100000, "one hundred thousand"], [100001, "one hundred thousand one"],
  [123456, "one hundred twenty-three thousand four hundred fifty-six"],
  [500000, "five hundred thousand"], [999999, "nine hundred ninety-nine thousand nine hundred ninety-nine"],
];
let failed = 0;
const check = (name, fn) => { try { fn(); } catch (e) { failed++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } };

for (const [n, words] of cases) check(`numberToWords(${n})`, () => assert.equal(numberToWords(n), words));
// Digit strings, including leading zeros.
for (const [d, words] of [["0", "zero"], ["00", "zero"], ["007", "seven"], ["24", "twenty-four"], ["002026", "two thousand twenty-six"]]) {
  check(`digitsToWords("${d}")`, () => assert.equal(digitsToWords(d), words));
}
// Out of range / not whole numbers are refused.
for (const bad of [-1, 1000000, 1.5, NaN, "5"]) check(`numberToWords(${String(bad)}) throws`, () => assert.throws(() => numberToWords(bad), RangeError));
// Every number 0..999999 gives words with no double spaces, no "and", and only a-z, space and hyphen.
check("every number 0..999999 is well formed", () => {
  for (let n = 0; n <= 999999; n++) {
    const w = numberToWords(n);
    if (!/^[a-z]+(?:[ -][a-z]+)*$/.test(w) || /\band\b/.test(w)) throw new Error(`${n} -> "${w}"`);
  }
});

const total = cases.length + 5 + 5 + 1;
console.log(failed ? `${failed} of ${total} tests FAILED` : `All ${total} number-to-words tests passed`);
process.exit(failed ? 1 : 0);
