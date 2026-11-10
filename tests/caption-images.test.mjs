import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadModule(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: path,
  });
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
    loadedModule,
    loadedModule.exports
  );
  return loadedModule.exports;
}

const thumbnails = loadModule("src/lib/thumbnails.ts");
const { SwipeVoteCard } = loadModule("src/components/SwipeVoteCard.tsx", {
  "@/lib/thumbnails": thumbnails,
});

test("production and staging image CDNs retain their responsive thumbnails", () => {
  for (const host of ["images.crackd.ai", "images.almostcrackd.ai"]) {
    const url = `https://${host}/folder/image.jpeg`;
    const variants = thumbnails.buildThumbnailVariants(url);
    assert.equal(variants.original, url);
    assert.equal(variants.src, `https://${host}/folder/image-828.jpeg`);
    assert.equal(variants.grid, `https://${host}/folder/image-640.jpeg`);
    assert.equal(variants.blur, `https://${host}/folder/image-320.jpeg`);
    assert.equal(variants.srcSet.split(", ").length, thumbnails.THUMBNAIL_SIZES.length);
    assert.ok(variants.srcSet.includes(`https://${host}/folder/image-3840.jpeg 3840w`));
  }
});

test("existing thumbnail URLs do not gain a second size suffix", () => {
  const variants = thumbnails.buildThumbnailVariants("https://images.crackd.ai/folder/image-640.png");
  assert.equal(variants.src, "https://images.crackd.ai/folder/image-828.png");
  assert.ok(!variants.srcSet.includes("-640-"));
});

test("external and lookalike hosts never get assumed thumbnail URLs", () => {
  for (const url of [
    "https://example.com/image.jpg",
    "https://example.com/image-640.jpg?signature=abc#fragment",
    "https://example.com/render?format=png",
    "https://images.crackd.ai.example.com/image.jpg",
    "https://example.com/images.crackd.ai/image.jpg",
    "https://images.crackd.ai@example.com/image.jpg",
    "https://project.supabase.co/storage/v1/object/public/images/image.jpg",
  ]) {
    assert.equal(thumbnails.buildThumbnailVariants(url), null, url);
  }
});

test("missing, local, data and unsupported URLs do not produce variants", () => {
  for (const url of [
    null, undefined, "", "/images/image.png", "not a url",
    "data:image/svg+xml,<svg></svg>", "blob:https://example.com/id",
    "ftp://images.crackd.ai/image.jpg", "https://images.crackd.ai/no-extension",
  ]) {
    assert.equal(thumbnails.buildThumbnailVariants(url), null, String(url));
  }
});

test("external caption cards render the exact original source without a srcset", () => {
  const html = renderToStaticMarkup(createElement(SwipeVoteCard, {
    captionId: "external", content: "External caption",
    imageSrc: "https://example.com/image-640.jpg?signature=abc#fragment",
  }));
  const image = html.match(/<img\b[^>]*>/)[0];
  assert.ok(image.includes('src="https://example.com/image-640.jpg?signature=abc#fragment"'));
  assert.ok(!image.includes("srcSet="));
  assert.ok(!image.includes("sizes="));
  assert.ok(image.includes("object-contain"));
  assert.ok(html.indexOf('id="caption-card-caption"') < html.indexOf('id="caption-card-image-frame"'));
});

test("hosted caption cards still render responsive sources", () => {
  const html = renderToStaticMarkup(createElement(SwipeVoteCard, {
    captionId: "hosted", content: "Hosted caption",
    imageSrc: "https://images.crackd.ai/folder/image.jpeg",
  }));
  const image = html.match(/<img\b[^>]*>/)[0];
  assert.ok(image.includes('src="https://images.crackd.ai/folder/image-828.jpeg"'));
  assert.ok(image.includes("srcSet="));
  assert.ok(image.includes("sizes="));
});
