import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Exercise the actual pure TypeScript implementation without missing test tools.
const source = await readFile(new URL('../src/lib/animations.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { circleOrigin, coveringScale } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('circle starts at the measured icon center, including scrolled coordinates', () => {
  assert.deepEqual(circleOrigin({ left: 23, top: 433, width: 50, height: 50 }), { x: 48, y: 458, radius: 25 });
});
test('final circle covers all viewport corners on mobile and desktop', () => {
  for (const [width, height] of [[393, 852], [412, 915], [1365, 768], [393, 600]]) {
    for (const x of [-50, 25, width / 2, width + 50]) for (const y of [-80, 80, height / 2, height + 80]) {
      const origin = { x, y, radius: 25 };
      const radius = coveringScale(origin, width, height) * origin.radius;
      for (const [cx, cy] of [[0, 0], [width, 0], [0, height], [width, height]]) {
        assert.ok(radius >= Math.hypot(cx - x, cy - y) + 1, `${width}x${height}, origin ${x},${y}`);
      }
    }
  }
});
test('a collapsed/missing icon never produces infinite transform values', () => {
  assert.ok(Number.isFinite(coveringScale({ x: 10, y: 10, radius: 0 }, 393, 852)));
});
