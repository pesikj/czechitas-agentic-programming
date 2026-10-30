// What signed-out visitors may see: lectures marked `public: true` in lecture.yaml and the
// images and files they reference. Everything else requires sign-in.
import type { Catalog, ContentModel, Exercise, TocNode } from './types';

/** The course reduced to public lectures, so visitors never see other lecture titles. */
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
 * Whether a URL path (as requested, percent-encoded) is a public lecture page of its own course
 * (`/lekce/<lecture>[/<part>]` for the main course, `/<course>/lekce/<lecture>[/<part>]` for an
 * additional one) or an image or file used by a public lecture of any course (`/obsah/<path>`).
 */
export function isPublicContentPath(catalog: Catalog, pathname: string): boolean {
  const segments = decodeSegments(pathname);
  if (!segments) return false;
  const [route, ...rest] = segments;
  if (route === 'obsah' && rest.length > 0) {
    const repoPath = rest.join('/');
    return catalog.courses.some((course) =>
      course.lectures.some(
        (lecture) => lecture.public && lecture.parts.some((part) => part.assets.some((asset) => asset.exists && asset.path === repoPath)),
      ),
    );
  }
  // The main course has no prefix; an additional course is prefixed with its id.
  const [main, ...additional] = catalog.courses;
  const course = route === 'lekce' ? main : additional.find((candidate) => candidate.id === route);
  const lecturePath = route === 'lekce' ? rest : rest[0] === 'lekce' ? rest.slice(1) : [];
  if (!course || (lecturePath.length !== 1 && lecturePath.length !== 2)) return false;
  return course.lectures.some((lecture) => lecture.public && lecture.id === lecturePath[0]);
}

function decodeSegments(pathname: string): string[] | undefined {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return undefined;
  }
}
