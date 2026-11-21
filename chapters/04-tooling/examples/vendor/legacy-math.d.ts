// legacy-math.js 的类型声明。TypeScript 解析 "./vendor/legacy-math.js" 时，
// 会自动找到旁边这个同名的 .d.ts。

/** 默认保留的小数位数 */
export declare const PRECISION: number;

/** 四舍五入到 digits 位小数 */
export declare function round(value: number, digits?: number): number;

export interface Stats {
  min: number;
  max: number;
  mean: number;
}

/** 空数组返回 null */
export declare function stats(values: readonly number[]): Stats | null;

declare const legacyMath: {
  round: typeof round;
  stats: typeof stats;
};
export default legacyMath;
