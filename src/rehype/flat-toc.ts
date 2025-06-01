import type { Root, RootContent, Element } from 'hast';
import type { Plugin } from 'unified';
import type { VFile } from 'vfile';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';

/**
 * This rehype plugin extracts the headings from the markdown elements but also the raw elements.
 * So we get html headings in the TOC as well
 *
 * It sets the file.data.fm.toc to a flat map of the toc
 */
export const extractToc: Plugin<[], Root> = () => {
  return (tree: Root, file: VFile) => {
    const details = tree.children.flatMap(extractDetails);
    if (file.data.fm === undefined) file.data.fm = {};
    // @ts-expect-error its untyped but for svmdex it is there
    file.data.fm.toc = details;
  };
};
export type Toc = TocEntry[];
export type TocEntry = {
  level: number;
  id: string;
  value: string;
};

function extractDetails(
  content:
    | RootContent
    | {
        type: 'raw';
        value: string;
      }
): TocEntry[] {
  if (content.type === 'element' && content.tagName.startsWith('h') && 'id' in content.properties) {
    const value =
      content.children.length === 1 && content.children[0].type === 'text'
        ? content.children[0].value
        : content.properties.id;
    return [
      {
        level: parseInt(content.tagName.slice(1)),
        id: content.properties.id,
        value
      }
    ];
  } else if (content.type === 'raw') {
    const parsed = parseRaw(content.value);
    return parsed.flatMap(extractDetails);
  }
  return [];
}

/**
 * Parses raw HTML and returns a flat array of all heading (h1-h6) elements as HAST nodes.
 */
export function parseRaw(raw: string): Element[] {
  // Parse the HTML string into a HAST Root node
  const tree = unified()
    .use(rehypeParse, { fragment: true }) // allow parsing HTML fragments
    .parse(raw) as Root;

  // Helper function to recursively find heading elements
  function collectHeadings(node: RootContent): Element[] {
    if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
      return [node];
    }
    // Check children recursively
    if ('children' in node && Array.isArray(node.children)) {
      return node.children.flatMap(collectHeadings);
    }
    return [];
  }

  // Flatten all headings found in the tree
  return tree.children.flatMap(collectHeadings);
}
