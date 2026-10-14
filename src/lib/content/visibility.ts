// What signed-out visitors may see: lectures marked `public: true` in lecture.yaml and the
// images they reference. Everything else requires sign-in.
import type { ContentModel, Exercise, TocNode } from './types';

/** The model reduced to public lectures, so visitors never see other lecture titles. */
export function publicModel(model: ContentModel): ContentModel {
  const lectures = model.lectures.filter((lecture) => lecture.public);
  const ids = new Set(lectures.map((lecture) => lecture.id));
  const exercises = new Map<string, Exercise>([...model.exercises].filter(([, exercise]) => ids.has(exercise.lectureId)));
  return { ...model, toc: filterToc(model.toc, ids), lectures, exercises };
}

/** The full model for signed-in users, the public part of it for visitors. */
export function visibleModel(model: ContentModel | undefined, signedIn: boolean): ContentModel | undefined {
  return model && !signedIn ? publicModel(model) : model;
}

function filterToc(nodes: TocNode[], ids: Set<string>): TocNode[] {
  return nodes.flatMap((node): TocNode[] => {
    if (node.kind === 'lecture') return ids.has(node.lectureId) ? [node] : [];
    const children = filterToc(node.children, ids);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

/**
 * Whether a URL path (as requested, percent-encoded) is a public lecture page
 * (`/lekce/<lecture>[/<part>]`) or an image used by a public lecture (`/obsah/<path>`).
 */
export function isPublicContentPath(model: ContentModel, pathname: string): boolean {
  const segments = decodeSegments(pathname);
  if (!segments) return false;
  const [route, ...rest] = segments;
  if (route === 'lekce' && (rest.length === 1 || rest.length === 2)) {
    return model.lectures.some((lecture) => lecture.public && lecture.id === rest[0]);
  }
  if (route === 'obsah' && rest.length > 0) {
    const repoPath = rest.join('/');
    return model.lectures.some(
      (lecture) => lecture.public && lecture.parts.some((part) => part.assets.some((asset) => asset.exists && asset.path === repoPath)),
    );
  }
  return false;
}

function decodeSegments(pathname: string): string[] | undefined {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return undefined;
  }
}
