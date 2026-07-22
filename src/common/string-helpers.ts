'use strict';

const ALPHA_REGEX = /[A-Za-z_@]/;
const ALPHA_NUM_REGEX = /[\w@]/;
const DIGIT_REGEX = /\d/;
const WHITESPACE_REGEX = /\s/;

export function isAlpha(character: string) {
    return ALPHA_REGEX.test(character);
}
export function isAlphaNum(character: string) {
    return ALPHA_NUM_REGEX.test(character);
}
export function isDigit(character: string) {
    return DIGIT_REGEX.test(character);
}
export function isWhitespace(character: string) {
    return WHITESPACE_REGEX.test(character);
}
export function reverse(text: string) {
    return [...text].reverse().join('');
}

