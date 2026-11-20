// Static look-and-feel preview: real component markup + the project's real
// compiled Tailwind CSS, written to one HTML file. No network, no database.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";

const require = (await import("node:module")).createRequire(import.meta.url);

function loadModule(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    mod, mod.exports
  );
  return mod.exports;
}

const captionOrder = loadModule("src/lib/study-caption-order.ts");
const { CaptionNavigator } = loadModule("src/components/CaptionNavigator.tsx", {
  "@/lib/study-caption-order": captionOrder,
});
const NullComponent = () => null;
const { CaptionVoteFlow } = loadModule("src/components/CaptionVoteFlow.tsx", {
  "@/app/study/actions": { startStudy: async () => {}, endStudy: async () => {} },
  "@/app/actions": {
    loadMoreCaptionVoteCaptions: async () => ({ success: true, captions: [] }),
    removeCaptionVote: async () => ({ success: true }),
    saveCaptionNavigationEvent: async () => ({ success: true }),
    saveCaptionVote: async () => ({ success: true }),
  },
  "@/lib/study-caption-order": captionOrder,
  "@/lib/caption-votes": loadModule("src/lib/caption-votes.ts"),
  "@/components/CompletedStudy": { CompletedStudy: NullComponent },
  "./CaptionNavigator": { CaptionNavigator },
  "./SwipeVoteCard": { SwipeVoteCard: NullComponent },
});

const startPage = renderToStaticMarkup(createElement(CaptionVoteFlow, {
  captionNumberOffset: 6,
  captionOrder: ["c7"],
  captions: [{ id: "c7", isLiked: false, isSaved: false, content: "Caption 7", imageSrc: null, studyCaptionMappingId: 7 }],
  initialNextOffset: null,
  initialTotalCaptionCount: 13,
  initialParticipation: { profile_id: "p", study_id: 1, started_at: "2026-11-01T12:00:00Z", ended_at: null, completion_stats: null },
  remainingCaptionCount: 7,
  studyId: 1,
}));

const position = { position: 7, total: 13 };
const navigator = renderToStaticMarkup(createElement(CaptionNavigator, {
  label: captionOrder.formatCaptionProgressLabel(position),
  onNext: () => {}, onPrevious: () => {}, position,
}));

// The bottom bar on its own, at the size and spacing the study gives it.
// This checks the control itself -- wording, contrast, target size, both
// themes. Where it sits against a real caption image is a layout question the
// running app answers, not this file.
const captionScreen = `
<div class="flex h-full flex-col items-center justify-end gap-6 pb-6">
  <p class="w-full max-w-xl px-4 text-center text-xl font-semibold leading-tight text-[var(--foreground)]">A cartoon dog explains the tax code to a visibly relieved accountant.</p>
  <div class="w-full max-w-xl px-4"><div class="h-56 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-surface)]"></div></div>
  <div class="flex justify-center">${navigator}</div>
</div>`;

const css = (await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;

// Each theme gets its own document, because the theme tokens live on :root.
const frame = (theme, body) => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
  html,body{height:100%}</style></head><body style="margin:0;background:var(--background);color:var(--foreground)">
  <div style="display:flex;flex-direction:column;height:100%;padding:16px 16px 0;box-sizing:border-box">${body}</div></body></html>`;

const startFrame = (theme) => frame(theme, `<div style="display:flex;flex:1;min-height:0;justify-content:center">${startPage}</div>`);
const captionFrame = (theme) => frame(theme, captionScreen);

// One file per screen and theme, so each can be opened at phone size.
const outDir = process.argv[2] ?? ".study-ui-preview";
mkdirSync(outDir, { recursive: true });
for (const theme of ["dark", "light"]) {
  writeFileSync(`${outDir}/start-${theme}.html`, startFrame(theme));
  writeFileSync(`${outDir}/caption-${theme}.html`, captionFrame(theme));
}
console.log(`wrote 4 files to ${outDir}: open start-dark.html, start-light.html, caption-dark.html, caption-light.html`);
