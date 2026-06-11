/**
 * vitest.config.ts — ⑦ 测试阶段（方案 ① lib 最小补）
 *
 * 极简配置：只测纯函数 lib/，不引入 jsdom（format.ts / status.ts 都无 DOM 依赖）。
 * node 环境即可，性能最好。
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: false, // 显式 import { describe, it, expect }，符合 Vite/TS 风格
    environment: 'node', // 纯函数测试，jsdom 不需要
    include: ['src/**/*.test.{ts,tsx}'],
    reporters: ['default'],
  },
})
