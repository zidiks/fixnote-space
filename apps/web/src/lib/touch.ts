/** A finger is the main pointer (phones, tablets): no hover, no keyboard shortcuts. */
export const isTouch = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
