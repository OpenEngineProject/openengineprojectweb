/**
 * Reusable paths under `public/icons/` — import from here instead of hard-coding URLs.
 *
 * **Editor atlas:** PNG is what the desktop editor ships for toolbar / tree UI (`EDITOR_ICON_PNG`).
 * Sparse SVG duplicates exist alongside; see `EDITOR_ICON_SVG`.
 * Sync source on engine side: Apps/Editor/Assets/Icons (https://github.com/Lunarsong/GameEngine).
 */
export const ICONS = {
	featureMarker: '/icons/feature-marker.svg',
	listBullet: '/icons/list-bullet.svg',
} as const;

export { EDITOR_ICON_PNG, type EditorIconPngKey } from './editor-icon-pngs.generated';

/** Editor SVGs (same filenames as engine; UI is mostly raster — see EDITOR_ICON_PNG). */
export const EDITOR_ICON_SVG = {
	arrowDown: '/icons/editor/ArrowDown.svg',
	arrowUp: '/icons/editor/ArrowUp.svg',
	lock: '/icons/editor/Lock.svg',
	lockOpen: '/icons/editor/LockOpen.svg',
} as const;

export type SiteIconKey = keyof typeof ICONS;
export type EditorIconSvgKey = keyof typeof EDITOR_ICON_SVG;

/** For `mask-image` / `-webkit-mask-image` in Astro `define:vars`. */
export function maskUrl(iconPath: string) {
	return `url('${iconPath}')`;
}
