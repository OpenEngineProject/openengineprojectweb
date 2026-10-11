/**
 * Publishes a curated set of GameEngine documentation into public/docs/
 * using stable lowercase paths.
 * Upstream repo: https://github.com/Lunarsong/GameEngine
 * The /docs landing page is built by Astro (src/pages/docs/index.astro), not written here.
 *
 * Usage:
 *   GAMEENGINE_DOCS_ROOT=/path/to/GameEngine/docs node scripts/sync-engine-docs.mjs
 *   GAMEENGINE_ROOT=/path/to/GameEngine node scripts/sync-engine-docs.mjs   # uses .../docs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const destDocsDir = join(rootDir, 'public', 'docs');
/** Lowercase URL segment: /docs/editor/… */
const destEditorDir = join(destDocsDir, 'editor');
const legacyDestEditorDir = join(destDocsDir, 'Editor');
const docsOverridesDir = join(__dirname, 'docs-overrides');

/** GameEngine source paths (capital Editor) → published filenames (lowercase). */
const SYNC_FILES = [
	{ srcRel: 'Editor/UI_COMPONENT_LIBRARY.html', destName: 'ui_component_library.html' },
	{ srcRel: 'Editor/UI_COMPONENT_LIBRARY.md', destName: 'ui_component_library.md' },
	{ srcRel: 'Editor/UI_GUIDELINES.md', destName: 'ui_guidelines.md' },
];

/** Publishable Markdown references. srcRel is relative to GameEngine/docs. */
const MARKDOWN_DOCS = [
	{ srcRel: 'USER_GUIDE.md', destRel: 'getting-started/user-guide', title: 'Game Engine User Guide' },
	{ srcRel: 'CLI_MANUAL.md', destRel: 'getting-started/cli-manual', title: 'GameEngine CLI Manual', publishMarkdown: false },
	{ srcRel: 'EditorKeyboardShortcuts.md', destRel: 'editor/keyboard-shortcuts', title: 'Editor Keyboard Shortcuts' },
	{ srcRel: 'SmartFolders.md', destRel: 'editor/smart-folders', title: 'Smart Folders' },
	{ srcRel: 'UI_API_GUIDE.md', destRel: 'editor/ui-api-guide', title: 'UI API Guide' },
	{ srcRel: 'Editor/UI_GUIDELINES.md', destRel: 'editor/ui-guidelines', title: 'Editor UI Guidelines' },
	{ srcRel: 'HDR_POST_PROCESSING_USER_GUIDE.md', destRel: 'rendering/hdr-post-processing', title: 'HDR Post-Processing User Guide' },
	{ srcRel: 'CUSTOMIZABLE_RENDER_PIPELINE_GUIDE.md', destRel: 'rendering/custom-render-pipeline', title: 'Customizable Render Pipeline Guide' },
	{ srcRel: 'SkyRendering.md', destRel: 'rendering/sky-rendering', title: 'Sky Rendering and Dynamic Environment Lighting' },
	{ srcRel: '../Engine/Modules/Rendering/docs/RenderGraph.md', destRel: 'rendering/render-graph', title: 'RenderGraph Quick Reference' },
	{ srcRel: '../Tools/ai/specs/gpu-debugging-guide.md', destRel: 'rendering/gpu-debugging-and-profiling', title: 'GPU Debugging and Profiling' },
	{ srcRel: 'Scripting_Architecture_Overview.md', destRel: 'scripting/overview', title: 'Scripting and Hot Reload Architecture' },
	{ srcRel: 'Scripting_PlayMode_Input_ECS_HowTo.md', destRel: 'scripting/csharp-play-mode-ecs', title: 'C# Play Mode, Input, and ECS' },
	{ srcRel: 'Scripting/HotReload_BestPractices.md', destRel: 'scripting/hot-reload', title: 'Hot Reload Best Practices' },
	{ srcRel: 'Animation/Quickstart.md', destRel: 'animation/quickstart', title: 'Humanoid Retargeting Quickstart' },
	{ srcRel: 'Animation/HumanoidRetargeting.md', destRel: 'animation/overview', title: 'Humanoid Retargeting Overview' },
	{ srcRel: 'Animation/Architecture.md', destRel: 'animation/architecture', title: 'Humanoid Retargeting Architecture' },
	{ srcRel: 'Animation/Reference.md', destRel: 'animation/api-reference', title: 'Humanoid Retargeting API Reference' },
	{ srcRel: 'ECS_COMPREHENSIVE_DOCUMENTATION_2024.md', destRel: 'engine-systems/entity-component-system', title: 'Entity Component System' },
	{ srcRel: 'Physics_Events_Guide.md', destRel: 'engine-systems/physics-events', title: 'Physics Collision and Trigger Events' },
	{ srcRel: '../Engine/Modules/Input/InputSystemDesign.md', destRel: 'engine-systems/input-system', title: 'Input System Design' },
	{ srcRel: 'BUILD_AND_TEST_GUIDE.md', destRel: 'contributors/build-and-test', title: 'Build and Test Guide' },
	{ srcRel: '../CodingStyle.md', destRel: 'contributors/coding-style', title: 'Coding Style' },
];

/** Authored HTML references that can be mirrored without Markdown conversion. */
const HTML_DOCS = [
	{ srcRel: 'Editor/Timeline-API-Manual.html', destRel: 'editor/timeline-api.html' },
	{ srcRel: 'Editor/Unified-Playback-API.html', destRel: 'editor/unified-playback-api.html' },
	{ srcRel: 'Rendering/shader-graph-spec.html', destRel: 'rendering/shader-graph-spec.html' },
	{ srcRel: '../Engine/Modules/Rendering/docs/Rendering_Architecture_Guide.html', destRel: 'rendering/architecture-guide.html' },
	{ srcRel: '../Engine/Modules/Rendering/docs/RenderPipelineAuthoring.html', destRel: 'rendering/render-pipeline-authoring.html' },
];

const MANAGED_DOC_DIRS = [
	'editor',
	'getting-started',
	'rendering',
	'scripting',
	'animation',
	'engine-systems',
	'contributors',
];

/** Portable checkout locations tried when no environment variable is set. */
const DEFAULT_GAMEENGINE_ROOTS = [
	join(rootDir, '..', 'GameEngine'),
	join(rootDir, '../../GitHub/GameEngine'),
	join(rootDir, '../../../GameEngine'),
	join(rootDir, '../GameEngine'),
];

function resolveSourceDir() {
	const env = process.env.GAMEENGINE_DOCS_ROOT?.trim();
	if (env) {
		if (!existsSync(env)) {
			console.error(`GAMEENGINE_DOCS_ROOT is set but path does not exist: ${env}`);
			process.exit(1);
		}
		return env;
	}

	const root = process.env.GAMEENGINE_ROOT?.trim();
	if (root) {
		const docsDir = join(root, 'docs');
		const marker = join(docsDir, 'Editor', 'UI_COMPONENT_LIBRARY.html');
		if (!existsSync(marker)) {
			console.error(
				`GAMEENGINE_ROOT is set (${root}) but expected file missing:\n  ${marker}`,
			);
			process.exit(1);
		}
		console.info(`Using docs from GAMEENGINE_ROOT: ${docsDir}`);
		return docsDir;
	}

	for (const gameRoot of DEFAULT_GAMEENGINE_ROOTS) {
		const candidate = join(gameRoot, 'docs');
		const marker = join(candidate, 'Editor', 'UI_COMPONENT_LIBRARY.html');
		if (existsSync(marker)) {
			console.info(`Using docs source (no env set): ${candidate}`);
			return candidate;
		}
	}
	console.error(
		[
			'Could not find GameEngine docs. Options:',
			'  GAMEENGINE_ROOT=/path/to/GameEngine        (recommended)',
			'  GAMEENGINE_DOCS_ROOT=/path/to/GameEngine/docs',
			`Example: GAMEENGINE_ROOT=${DEFAULT_GAMEENGINE_ROOTS[0]} npm run sync:engine-docs`,
		].join('\n'),
	);
	process.exit(1);
}

function loadMarketingNavTemplate() {
	return readFileSync(join(__dirname, 'openengine-marketing-nav.html'), 'utf8');
}

/** Flex containers treat whitespace-only text nodes as items; they pick up line-height and grow the bar. */
function compactAdjacentTags(html) {
	return html.replace(/>\s+</g, '><').trim();
}

function injectMarketingChrome(html) {
	const cssPath = join(__dirname, 'openengine-marketing-nav.css');
	const css = readFileSync(cssPath, 'utf8');
	const nav = compactAdjacentTags(loadMarketingNavTemplate());
	const styleBlock = `\n  <style id="openengine-marketing-nav">\n${css}\n  </style>\n`;

	if (!html.includes('</head>')) {
		console.error('Cannot inject styles: missing </head>');
		return html;
	}
	html = html.replace('</head>', `${styleBlock}</head>`);

	if (!html.includes('<body>')) {
		console.error('Cannot inject nav: missing <body>');
		return html;
	}
	/*
	 * body.oe-with-marketing-nav is display:flex; column. Whitespace text nodes between
	 * </header> and <div class="shell"> become flex items (body line-height → gap).
	 * Whitespace inside <header class="oe-marketing-nav"> also becomes flex items there.
	 */
	html = html.replace('<body>', `<body class="oe-with-marketing-nav">${nav}`);
	html = html.replace(/(<\/header>)\s+(?=<div\s[^>]*\bclass\s*=\s*["']shell["'])/i, '$1');
	return html;
}

const ICON_GALLERY_PLACEHOLDER = '<!-- OPENENGINE_ICON_GALLERY -->';

function escapeHtml(s) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Fills the UI library HTML with <img> cells from public/icons/editor (PNG + SVG). */
function injectIconGallery(html, openengineWebRoot) {
	if (!html.includes(ICON_GALLERY_PLACEHOLDER)) {
		console.info('sync-engine-docs: no icon gallery placeholder in HTML; skip icon grid.');
		return html;
	}

	const dir = join(openengineWebRoot, 'public', 'icons', 'editor');
	const emptyMsg = `<p class="purpose">No mirrored files yet. From <code>openengine-web</code> run <code>npm run sync:editor-icons:png</code> (copies from GameEngine <code>Apps/Editor/Assets/Icons</code>), then re-run this sync.</p>`;

	if (!existsSync(dir)) {
		return html.replace(ICON_GALLERY_PLACEHOLDER, emptyMsg);
	}

	const files = readdirSync(dir)
		.filter((n) => /\.(png|svg)$/i.test(n))
		.sort((a, b) => a.localeCompare(b, 'en'));

	if (files.length === 0) {
		return html.replace(ICON_GALLERY_PLACEHOLDER, emptyMsg);
	}

	const cells = files.map((f) => {
		// Vite serves literal "@" characters in static filenames, but does not
		// resolve their "%40" representation. Keep "@" readable while encoding
		// spaces and any other characters that are unsafe in a URL path.
		const enc = encodeURIComponent(f).replaceAll('%40', '@');
		const label = escapeHtml(f);
		const href = `/icons/editor/${enc}`;
		return `<figure><a href="${href}" target="_blank" rel="noopener"><img src="${href}" alt="${label}" loading="lazy" decoding="async" /></a><figcaption>${label}</figcaption></figure>`;
	});

	const grid = `<div class="editor-icon-gallery-grid">${cells.join('')}</div><p class="purpose" style="margin-top:14px"><strong>${files.length}</strong> files in <code>/icons/editor/</code>.</p>`;
	return html.replace(ICON_GALLERY_PLACEHOLDER, grid);
}

/** Point sidebar / cross-links at lowercase mirrored filenames. */
function rewriteHtmlForLowercaseUrls(html) {
	return html
		.replaceAll('href="UI_COMPONENT_LIBRARY.md"', 'href="ui_component_library.md"')
		.replaceAll('href="UI_GUIDELINES.md"', 'href="ui_guidelines.md"')
		.replaceAll('>UI_COMPONENT_LIBRARY.md<', '>ui_component_library.md<')
		.replaceAll('>UI_GUIDELINES.md<', '>ui_guidelines.md<')
		.replaceAll('http://localhost:4321/docs/Editor/UI_COMPONENT_LIBRARY.html', 'http://localhost:4321/docs/editor/ui_component_library.html')
		.replaceAll('/docs/Editor/UI_COMPONENT_LIBRARY.html', '/docs/editor/ui_component_library.html');
}

function indentNonEmptyLines(content, indentation) {
	return content
		.split('\n')
		.map((line) => (line ? `${indentation}${line}` : ''))
		.join('\n');
}

/**
 * The engine owns the component inventory, while the website owns the richer visual previews.
 * Reapply those previews after every mirror so an upstream docs refresh cannot replace them
 * with the intentionally minimal source examples.
 */
function applyComponentLibraryOverrides(html) {
	const css = readFileSync(join(docsOverridesDir, 'component-library.css'), 'utf8').trim();
	const replacements = [
		{
			id: 'scene-widgets',
			file: 'component-library-scene-view.html',
		},
		{
			id: 'timeline-controls',
			file: 'component-library-animation.html',
		},
	];

	for (const { id, file } of replacements) {
		const article = readFileSync(join(docsOverridesDir, file), 'utf8').trim();
		const pattern = new RegExp(
			`[\\t ]*<article\\b[^>]*\\bid=["']${id}["'][\\s\\S]*?<\\/article>`,
			'i',
		);
		if (!pattern.test(html)) {
			throw new Error(`Cannot apply component-library override: article #${id} is missing.`);
		}
		html = html.replace(pattern, `\n\n${indentNonEmptyLines(article, '          ')}`);
	}

	if (!html.includes('</style>')) {
		throw new Error('Cannot apply component-library overrides: source has no </style>.');
	}
	html = html.replace(
		/[\t ]*<\/style>/,
		`\n\n    /* OPENENGINE_COMPONENT_LIBRARY_OVERRIDES */\n${indentNonEmptyLines(css, '    ')}\n  </style>`,
	);
	return html;
}

/** Markdown: link targets + displayed backtick filenames (web uses lowercase names). */
function rewriteMdForLowercaseUrls(md) {
	return md
		.replaceAll('](UI_COMPONENT_LIBRARY.html)', '](ui_component_library.html)')
		.replaceAll('](UI_COMPONENT_LIBRARY.md)', '](ui_component_library.md)')
		.replaceAll('](UI_GUIDELINES.md)', '](ui_guidelines.md)')
		.replaceAll('`UI_COMPONENT_LIBRARY.html`', '`ui_component_library.html`')
		.replaceAll('`UI_COMPONENT_LIBRARY.md`', '`ui_component_library.md`')
		.replaceAll('`UI_GUIDELINES.md`', '`ui_guidelines.md`');
}

const PUBLIC_ECS_OVERVIEW = `# Entity Component System

Open Engine uses a data-oriented Entity Component System as its default runtime model. Entities
identify objects, components hold data, and systems process matching component sets.

## Core model

- Components are registered by type and stored in archetype-oriented data structures.
- Queries select the component combinations a system needs.
- Structural changes can be queued through command buffers.
- Batch creation and reservation APIs are available for workloads that create many entities.
- C++20 templates provide type-safe component access without requiring a central hand-written
  switch for every component type.

## Typical use

\`\`\`cpp
struct Position {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
};

world.registerComponent<Position>();
auto entity = world.create();
entity.set(Position{1.0f, 2.0f, 3.0f});

world.query<Position>().each([](auto, Position& position) {
    position.y += 1.0f;
});
\`\`\`

## Performance guidance

Use batch APIs, reserve expected capacity, and measure representative project workloads before
choosing an optimization. Benchmark results depend on platform, build configuration, component
layout, and workload, so this public reference intentionally does not publish unversioned headline
numbers.

## Development status

The ECS is an active part of the engine and continues to evolve with the editor, rendering,
physics, audio, input, and gameplay systems. Consult the current source and tests for exact API
availability before relying on a specific method in production code.
`;

function stripEmojiForPublication(text) {
	return text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '');
}

function sanitizeMarkdownForPublication(markdown, srcRel) {
	let output = stripEmojiForPublication(markdown)
		.replace(
			/Shadow copying \/ bootstrap hot-reload experiments:[\s\S]*?historical only\./,
			'Earlier shadow-copying and bootstrap hot-reload documentation is historical; the collectible AssemblyLoadContext and ScriptAssemblies pipeline described here is the current path.',
		)
		.replace(/Optimized, production-ready/gi, 'Optimized release build');

	if (srcRel === 'ECS_COMPREHENSIVE_DOCUMENTATION_2024.md') {
		return PUBLIC_ECS_OVERVIEW;
	}

	if (srcRel === 'Animation/HumanoidRetargeting.md') {
		output = output
			.replace(
				/^> \*\*Status:\*\*[\s\S]*?(?=\n> \*\*Goal:\*\*)/m,
				'> **Status:** The CPU retargeting path is available in the editor. GPU orchestration and broader importer coverage remain under active development.\n',
			)
			.replace(
				/^> \*\*Goal:\*\*[\s\S]*?(?=\n---)/m,
				'> **Goal:** A unified runtime humanoid retargeting system for different rig layouts, attachments, and IK workflows.\n',
			)
			.replace(/\n## Why the existing code doesn't ship[\s\S]*?(?=\n## The new architecture)/, '\n')
			.replace(
				/\n\*\*Key abstraction borrowed from UE5:\*\*[\s\S]*?(?=\n## The pipeline)/,
				'\nThe architecture separates the authored retarget pose from the imported bind pose, stores reusable canonical skeleton profiles, and evaluates retargeting at runtime so a source clip can be reused across compatible target characters.\n',
			)
			.replace(/\n## What "out of the box" means[\s\S]*?(?=\n## When is)/, '\n')
			.replace(/\n## Performance \(GPU-resident, v4\)[\s\S]*?(?=\n## What this gets)/, '\n')
			.replace(/\n## Phasing \(v4[\s\S]*?(?=\n## What this gets)/, '\n')
			.replace(/\bproduction\b/gi, 'current')
			.replace(/\bshipped\b/gi, 'available');
	}

	return output;
}

function sanitizeHtmlForPublication(sourceHtml) {
	const personalFirstName = ['La', 'rs'].join('');
	let output = stripEmojiForPublication(sourceHtml)
		.replace(
			/Shadow copying \/ bootstrap hot-reload experiments:[\s\S]*?historical only\./,
			'Earlier shadow-copying and bootstrap hot-reload documentation is historical; the collectible AssemblyLoadContext and ScriptAssemblies pipeline described here is the current path.',
		)
		.replace(
			/<div class="panel ok">\s*<p class="panel-title">Unity mental model<\/p>[\s\S]*?<\/div>\s*/gi,
			'',
		)
		.replace(
			/matches Unity's Vertex Stage[\s\S]*?modified vertex attributes\./i,
			'runs in the vertex stage before the final clip-space position is calculated.',
		)
		.replace(
			/\(matches Unity's Vertex Stage\s+convention; one transform shy of UE's World Position Offset\)/gi,
			'before the final world transform',
		)
		.replace(/Optimized, production-ready/gi, 'Optimized release build')
		.replace(
			/Design rationale, comparison with UE RDG\/Frostbite\/Godot, and measured claims:\s*<code>Tools\/ai\/rendering\/render-graph-redesign\.html<\/code>\.\s*/i,
			'Implementation details are documented in the RenderGraph quick reference. ',
		)
		.replaceAll(`assisting ${personalFirstName}`, 'assisting the project')
		.replaceAll(`If ${personalFirstName} hands this whole document to an LLM agent and says "build me the data side":`, 'When this document is provided to an implementation agent:')
		.replaceAll(`TL;DR for ${personalFirstName}`, 'Implementation summary')
		.replace(new RegExp(`\\b${personalFirstName}\\b`, 'gi'), 'the project maintainer');

	// Remove comparison-only prose while retaining the engine API description around it.
	output = output
		.replace(/\s+— Unity\s+[^<]*(?=<\/p>)/gi, '')
		.replace(/\s+— Unity\s+[^<]*(?=<\/li>)/gi, '');

	return output;
}

function markdownDocumentTemplate(title, renderedContent) {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Open Engine Documentation</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Roboto, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    html { background: #05070c; }
    body { margin: 0; color: #cbc8d3; background: #05070c; }
    .oe-markdown-document { width: min(100%, 1080px); margin: 0 auto; padding: 56px clamp(20px, 5vw, 72px) 96px; }
    h1, h2, h3, h4 { color: #f2f0f6; font-weight: 400; line-height: 1.15; }
    h1 { margin: 0 0 32px; font-size: clamp(32px, 4.8vw, 58px); font-weight: 300; letter-spacing: .035em; }
    h2 { margin: 52px 0 18px; padding-bottom: 12px; border-bottom: 1px solid rgba(139, 172, 204, .2); font-size: clamp(25px, 3vw, 34px); }
    h3 { margin: 34px 0 14px; font-size: 22px; }
    p, li { font-size: 16px; font-weight: 300; line-height: 1.72; }
    a { color: #8beeff; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { color: #c4efff; }
    pre { overflow-x: auto; padding: 18px; border: 1px solid rgba(139, 172, 204, .18); background: #05070b; color: #c4efff; line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { padding: 10px 12px; border: 1px solid rgba(139, 172, 204, .18); text-align: left; vertical-align: top; }
    th { color: #f2f0f6; background: rgba(17, 24, 39, .86); }
    blockquote { margin: 24px 0; padding: 2px 20px; border-left: 3px solid #6ee7ff; background: rgba(110, 231, 255, .06); }
    .mermaid .cluster rect, pre.mermaid svg .cluster rect { fill: #080c13 !important; stroke: rgba(110, 231, 255, .32) !important; }
    .mermaid .cluster-label text, .mermaid .cluster-label span, pre.mermaid svg .cluster-label text, pre.mermaid svg .cluster-label span { fill: #d9f8ff !important; color: #d9f8ff !important; }
    img { max-width: 100%; height: auto; }
    hr { margin: 48px 0; border: 0; border-top: 1px solid rgba(139, 172, 204, .18); }
  </style>
</head>
<body>
  <main class="oe-markdown-document">
${renderedContent}
  </main>
</body>
</html>`;
}

const srcDir = resolveSourceDir();
mkdirSync(destDocsDir, { recursive: true });

const legacyIndex = join(destDocsDir, 'index.html');
if (existsSync(legacyIndex)) {
	rmSync(legacyIndex);
	console.info('Removed legacy public/docs/index.html (Astro owns /docs/).');
}

if (existsSync(legacyDestEditorDir)) {
	rmSync(legacyDestEditorDir, { recursive: true, force: true });
	console.info('Removed legacy public/docs/Editor/ (URLs are now /docs/editor/…).');
}
for (const managedDir of MANAGED_DOC_DIRS) {
	const target = join(destDocsDir, managedDir);
	if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
mkdirSync(destEditorDir, { recursive: true });

for (const { srcRel, destName } of SYNC_FILES) {
	const from = join(srcDir, srcRel);
	if (!existsSync(from) || !statSync(from).isFile()) {
		console.error(`Missing source file: ${from}`);
		process.exit(1);
	}
	const to = join(destEditorDir, destName);
	if (destName.endsWith('.md')) {
		const raw = readFileSync(from, 'utf8');
		writeFileSync(to, sanitizeMarkdownForPublication(rewriteMdForLowercaseUrls(raw), srcRel), 'utf8');
	} else {
		writeFileSync(to, sanitizeHtmlForPublication(readFileSync(from, 'utf8')), 'utf8');
	}
}

let html = readFileSync(join(destEditorDir, 'ui_component_library.html'), 'utf8');
// Full docs tree is not published; README lives only on the engine repo.
html = html.replaceAll('href="../README.md"', 'href="/"');
html = rewriteHtmlForLowercaseUrls(html);
html = applyComponentLibraryOverrides(html);
html = injectMarketingChrome(html);
html = injectIconGallery(html, rootDir);
const mirroredHtmlPath = join(destEditorDir, 'ui_component_library.html');
writeFileSync(mirroredHtmlPath, html, 'utf8');

const markdownProcessor = await createMarkdownProcessor({ syntaxHighlight: false });
for (const { srcRel, destRel, title, publishMarkdown = true } of MARKDOWN_DOCS) {
	const from = join(srcDir, srcRel);
	if (!existsSync(from) || !statSync(from).isFile()) {
		console.error(`Missing source file: ${from}`);
		process.exit(1);
	}

	const raw = sanitizeMarkdownForPublication(
		rewriteMdForLowercaseUrls(readFileSync(from, 'utf8')),
		srcRel,
	);
	const markdownPath = join(destDocsDir, `${destRel}.md`);
	const htmlPath = join(destDocsDir, `${destRel}.html`);
	mkdirSync(dirname(markdownPath), { recursive: true });
	if (publishMarkdown) writeFileSync(markdownPath, raw, 'utf8');

	const rendered = await markdownProcessor.render(raw, { fileURL: from });
	writeFileSync(htmlPath, markdownDocumentTemplate(title, rendered.code), 'utf8');
}

for (const { srcRel, destRel } of HTML_DOCS) {
	const from = join(srcDir, srcRel);
	if (!existsSync(from) || !statSync(from).isFile()) {
		console.error(`Missing source file: ${from}`);
		process.exit(1);
	}
	const to = join(destDocsDir, destRel);
	mkdirSync(dirname(to), { recursive: true });
	writeFileSync(to, sanitizeHtmlForPublication(readFileSync(from, 'utf8')), 'utf8');
}

const publishedCount = 1 + MARKDOWN_DOCS.length + HTML_DOCS.length;
console.info(`Synced ${publishedCount} published references from ${srcDir} → ${destDocsDir}`);
console.info(`Preview (marketing nav + CSS): npm run dev → http://localhost:4321/docs/editor/ui_component_library.html`);
console.info(`Mirrored file: ${mirroredHtmlPath}`);
