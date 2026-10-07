import { expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

it("/r/<code> serves the game shell with the room in data-room", async () => {
  const res = await fetch(new URL("/r/ABCD", baseUrl));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('data-room="ABCD"');
});

it("/r/<code> is case-insensitive", async () => {
  const res = await fetch(new URL("/r/abcd", baseUrl));
  expect(res.status).toBe(200);
});

it.each(["/r/ABC1", "/r/ABCDE", "/r/ABC", "/r/"])("%s is a 404", async (path) => {
  const res = await fetch(new URL(path, baseUrl));
  expect(res.status).toBe(404);
  await res.text();
});

it("/ is the game shell and explains the game without JavaScript", async () => {
  const res = await fetch(new URL("/", baseUrl));
  const html = await res.text();
  expect(html).toContain('id="game"');
  const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/i);
  expect(noscript, "expected a <noscript> block").not.toBeNull();
  const text = noscript![1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  expect(text.length).toBeGreaterThan(150);
  expect(text).toMatch(/javascript/i);
});
