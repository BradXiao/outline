import type { TFunction } from "i18next";
import { toast } from "sonner";
import { AttachmentPreset } from "@shared/types";
import { errToString } from "@shared/utils/error";
import type DocumentsStore from "~/stores/DocumentsStore";
import { uploadFile } from "~/utils/files";
import history from "~/utils/history";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".bmp",
]);

/**
 * Returns true if the file is an image based on its extension or MIME type.
 *
 * @param file - File to check.
 * @returns true if the file is an image.
 */
function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }
  const dot = file.name.lastIndexOf(".");
  return dot !== -1 && IMAGE_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

/**
 * Returns true if the file should be processed as markdown, in which case its
 * code fences and image references are transformed before import.
 *
 * @param file - File to check.
 * @returns true if the file is markdown (or plain text).
 */
function isMarkdownFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".md") ||
    file.type === "text/markdown" ||
    file.type === "text/plain"
  );
}

/**
 * Returns true if the file is a document type supported for import, matching
 * either a known extension or MIME type from the documents store.
 *
 * @param file - File to check.
 * @param importFileTypes - Supported extensions (".md") and MIME types.
 * @returns true if the file can be imported as a document.
 */
function isSupportedDocFile(file: File, importFileTypes: string[]): boolean {
  const name = file.name.toLowerCase();
  return importFileTypes.some((type) =>
    type.startsWith(".") ? name.endsWith(type) : file.type === type
  );
}

/** Returns the directory prefix of a relative path (with trailing slash), or "". */
function dirOf(relativePath: string): string {
  const last = relativePath.lastIndexOf("/");
  return last === -1 ? "" : relativePath.slice(0, last + 1);
}

/**
 * Normalizes a relative path, resolving "." and ".." segments and stripping a
 * leading "./" so that e.g. "notes/../media/x.png" becomes "media/x.png".
 *
 * @param path - The path to normalize.
 * @returns The normalized path.
 */
function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** Decodes percent-encoding in a path, falling back to the original on error. */
function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Returns true if a markdown image src refers to a local file (and so should be
 * resolved against the selected files). Remote URLs, protocol-relative URLs,
 * data/blob URIs, root-absolute paths and fragments are treated as non-local.
 *
 * @param src - The image src as it appears in the markdown.
 * @returns true if the src is a local file reference.
 */
function isLocalImageRef(src: string): boolean {
  const value = src.trim();
  if (!value) {
    return false;
  }
  // scheme: (http:, https:, data:, blob:, mailto:, etc.), //host, /root, #frag
  return (
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.startsWith("//") &&
    !value.startsWith("/") &&
    !value.startsWith("#")
  );
}

/**
 * Looks up an image File for a given src path.
 * Tries (in order):
 *   1. Exact src match — covers the case where the user selected the media
 *      directory directly and webkitRelativePath equals the src.
 *   2. mdDir + src, normalized — covers the case where the user selected the
 *      parent directory and all paths are prefixed (e.g.
 *      "notes/vim-media/hash.webp"), including "../" relative references.
 *   3. Suffix match — any indexed path that ends with the (normalized) src,
 *      tolerant of an extra shared root folder added by directory selection.
 *   4. Basename only — last-resort fallback.
 *
 * @param imageMap - Map from path/basename to File.
 * @param src - The image path as it appears in the document (e.g. "vim-media/hash.webp").
 * @param mdDir - Directory prefix of the md file (e.g. "notes/").
 * @returns The matched File, or undefined.
 */
function findImage(
  imageMap: Map<string, File>,
  src: string,
  mdDir: string
): File | undefined {
  const decodedSrc = decodeURIComponentSafe(src);
  const normalizedSrc = normalizePath(decodedSrc);

  const direct =
    imageMap.get(decodedSrc) ??
    imageMap.get(normalizedSrc) ??
    (mdDir ? imageMap.get(normalizePath(mdDir + decodedSrc)) : undefined);
  if (direct) {
    return direct;
  }

  // Suffix match: handles directory selection adding a shared root prefix to
  // every webkitRelativePath (e.g. src "media/x.png" vs "vault/media/x.png").
  const suffix = "/" + normalizedSrc;
  for (const [key, file] of imageMap) {
    if (key === normalizedSrc || key.endsWith(suffix)) {
      return file;
    }
  }

  return imageMap.get(normalizedSrc.split("/").pop() ?? normalizedSrc);
}

/**
 * Resolves image references in markdown content by uploading the matching
 * files and substituting the resulting attachment URLs.
 *
 * Handles three syntaxes:
 *   - Wiki embed:  ![[filename.ext]]
 *   - HTML img:    <img src="dir/hash.ext" class="wikilink" alt="name.ext" />
 *     (including multi-line tags)
 *   - Markdown:    ![alt](dir/img.ext) — only when the path is a local file
 *     reference (URLs, data URIs and root-absolute paths are left untouched).
 *
 * Found images are replaced with standard markdown `![alt](url)`.
 * For wiki/HTML embeds, a missing image becomes `==[["name.ext" not found]]==`;
 * a missing markdown reference is left exactly as-is so intentional relative
 * links are never clobbered.
 *
 * @param content - Raw markdown content.
 * @param imageMap - Map from relative path / basename to File.
 * @param mdRelativePath - webkitRelativePath of the md file being processed.
 * @returns Resolved markdown string.
 */
async function resolveImageRefs(
  content: string,
  imageMap: Map<string, File>,
  mdRelativePath: string
): Promise<string> {
  const mdDir = dirOf(mdRelativePath);

  type Ref = {
    start: number;
    end: number;
    src: string;
    altText: string;
    /** When true, leave the original text untouched if no file is matched. */
    keepOriginalIfMissing?: boolean;
  };

  const refs: Ref[] = [];

  // ![[filename.ext]]
  const wikiPattern =
    /!\[\[([^\]]+\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp))\]\]/gi;
  for (const m of content.matchAll(wikiPattern)) {
    const filename = m[1];
    refs.push({
      start: m.index!,
      end: m.index! + m[0].length,
      src: filename,
      altText: filename.split("/").pop() ?? filename,
    });
  }

  // <img ... class="wikilink" ... /> — [\s\S]*? handles multi-line tags
  const htmlPattern = /<img\s[\s\S]*?\/>/g;
  for (const m of content.matchAll(htmlPattern)) {
    if (!m[0].includes('class="wikilink"')) {
      continue;
    }
    const srcMatch = m[0].match(/src="([^"]+)"/);
    if (!srcMatch) {
      continue;
    }
    const altMatch = m[0].match(/alt="([^"]+)"/);
    const src = srcMatch[1];
    const alt = altMatch?.[1] ?? src.split("/").pop() ?? src;
    refs.push({
      start: m.index!,
      end: m.index! + m[0].length,
      src,
      altText: alt,
    });
  }

  // ![alt](src) or ![alt](<src> "title") — standard markdown images. Only local
  // file references are rewritten; remote/data/absolute sources are skipped so
  // already-valid links are preserved.
  const markdownPattern = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))[^)]*\)/g;
  for (const m of content.matchAll(markdownPattern)) {
    const src = m[2] ?? m[3];
    if (!src || !isLocalImageRef(src)) {
      continue;
    }
    refs.push({
      start: m.index!,
      end: m.index! + m[0].length,
      src,
      altText: m[1] || (src.split("/").pop() ?? src),
      keepOriginalIfMissing: true,
    });
  }

  // Sort descending so replacements don't shift earlier positions
  refs.sort((a, b) => b.start - a.start);

  const resolved = await Promise.all(
    refs.map(async (ref) => {
      const file = findImage(imageMap, ref.src, mdDir);

      if (file) {
        try {
          const attachment = await uploadFile(file, {
            name: file.name,
            preset: AttachmentPreset.DocumentAttachment,
          });
          return {
            ...ref,
            replacement: `![${ref.altText}](${attachment.url})`,
          };
        } catch {
          // fall through to not-found
        }
      }

      return {
        ...ref,
        replacement: ref.keepOriginalIfMissing
          ? content.slice(ref.start, ref.end)
          : `==[[${JSON.stringify(ref.altText)} not found]]==`,
      };
    })
  );

  let result = content;
  for (const { start, end, replacement } of resolved) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

/** Destination for an import: a collection and/or a parent document. */
type ImportTarget = {
  /** The collection to import into, if known. */
  collectionId?: string | null;
  /** The parent document to nest imported documents under, if any. */
  parentDocumentId?: string | null;
};

/**
 * Imports a selection of files into a collection or document. Document files
 * each become a document; image files are used to resolve inline image
 * references in any markdown documents in the same selection (see
 * {@link resolveImageRefs}). Code fence languages are normalized to the
 * editor's identifiers at parse time (see CodeFence.parseMarkdown), so no
 * markdown rewriting is needed for them here.
 *
 * A single document is simply the N=1 case — the same loop handles one file,
 * many files, or an entire directory tree. Files that are neither images nor
 * supported document types are silently skipped, so selecting a directory does
 * not error on unrelated files (e.g. ".json", ".canvas").
 *
 * @param files - The files to import (from a picker or directory selection).
 * @param target - The destination collection and/or parent document.
 * @param documents - The documents store used to perform the import.
 * @param t - The translation function for user-facing messages.
 * @returns A promise that resolves when all document files are processed.
 */
export async function importFiles(
  files: File[],
  target: ImportTarget,
  documents: DocumentsStore,
  t: TFunction
): Promise<void> {
  // Build a lookup map for image files: keyed by webkitRelativePath and name
  const imageMap = new Map<string, File>();
  const docFiles: File[] = [];

  for (const file of files) {
    if (isImageFile(file)) {
      imageMap.set(file.name, file);
      if (file.webkitRelativePath) {
        imageMap.set(file.webkitRelativePath, file);
      }
    } else if (isSupportedDocFile(file, documents.importFileTypes)) {
      docFiles.push(file);
    }
  }

  // Only redirect for a lone document; a batch should stay in place rather than
  // bounce to whichever document happened to import last.
  const redirect = docFiles.length === 1;

  for (const file of docFiles) {
    const toastId = toast.loading(`${t("Uploading")} ${file.name}…`);

    try {
      let importFile = file;

      // Image references must be resolved client-side because the matching
      // files only exist in the browser selection. Only rewrite the markdown
      // when there are images to resolve; otherwise upload the file untouched.
      if (isMarkdownFile(file) && imageMap.size > 0) {
        const text = await resolveImageRefs(
          await file.text(),
          imageMap,
          file.webkitRelativePath
        );
        importFile = new File([text], file.name, { type: file.type });
      }

      const doc = await documents.import(
        importFile,
        target.parentDocumentId ?? null,
        target.collectionId ?? null,
        { publish: true }
      );
      if (redirect) {
        history.push(doc.path);
      }
    } catch (err) {
      toast.error(`${file.name}: ${errToString(err)}`);
    } finally {
      toast.dismiss(toastId);
    }
  }
}
