/** 数字格式化：放大后 half-up 再拼串。不用 toFixed，它的边界舍入依赖二进制表示。 */
export function fmt(value: number, digits = 2): string {
  const negative = value < 0;
  const scale = 10 ** digits;
  const scaled = Math.floor(Math.abs(value) * scale + 0.5);
  const whole = Math.floor(scaled / scale);
  const fraction = scaled % scale;
  const text = digits > 0 ? `${whole}.${String(fraction).padStart(digits, "0")}` : `${whole}`;
  return negative && scaled !== 0 ? `-${text}` : text;
}
