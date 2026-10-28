/**
 * Host half of `@local/dsh-touch`.
 *
 * The whole feature lives in the Client half (`./client.js`): the long-press
 * gesture, the touch action sheet, and the coarse-pointer CSS live in the page.
 * The Host therefore registers nothing and only exists so the Loader has an
 * entry for the bundle.
 */
export function apply() {}
